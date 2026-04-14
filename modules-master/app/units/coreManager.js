const { Engine } = require("../build/Release/ag_backend.node");
const path = require("path");
const fs = require("fs");
const dbManager = require("./dbManager");
const libraryManager = require("./libraryManager");
const playlist = require("./playlistManager");
const configManager = require("./configManager"); // 引入 JSON 配置

class CoreManager {
  constructor() {
    this.wss = null; // 初始不绑定网络
    this.engine = new Engine();
    this.view = new DataView(this.engine.getSharedStatusBuffer().buffer);
    this.lastState = -1;
    this.lastLayout = null; // 缓存最新歌词，供后来连入的客户端同步
    this.libraryFolders = []; // 实时维护监控目录列表
    this.playlist = playlist;
    this.currentPlaying = null; // [New] 显式维护当前正在播的元数据，不依赖游标。

    // 锁定引用防止被 GC
    global._engineRef = this.engine;

    this.initSync();
  }

  /**
   * 后期绑定网络总线
   */
  bindWss(wss) {
    this.wss = wss;
  }

  /**
   * 50ms 极速心跳：负责状态分发和自动切歌
   */
  // 在 CoreManager.js 的 initSync 中：
  initSync() {
    // 1. 高频状态更新 (对应你 C++ 的 StatusUpdate)
    // 负责：进度广播 (timePos, duration)
    this.engine.setOnStatusUpdate(() => {
      const currentState = this.view.getInt32(0, true);
      // 仅在播放或暂停时读取进度并广播
      if (currentState === 3 || currentState === 4) {
        const timePos = this.view.getFloat64(8, true);
        const duration = this.view.getFloat64(16, true);
        this.broadcast({
          type: "playback_status",
          state: currentState,
          timePos: timePos,
          duration: duration,
          // 高频词级进度数据，驱动前端逐字动画，前端无需自己估算
          lineProgress: this.view.getFloat64(48, true), // offset 48
          wordIndex:    this.view.getInt32(56, true),   // offset 56
          wordProgress: this.view.getFloat64(64, true), // offset 64
        });
      }
    });

    // 2. 状态切换更新 (对应你 C++ 的 StateChange)
    // 负责：处理 EOF (切歌)、播放/暂停状态切换广播
    this.engine.setOnStateChange(() => {
      const currentState = this.view.getInt32(0, true);

      // 处理播放结束自动切歌
      if (currentState === 5 && this.lastState !== 5) {
        console.log("🏁 [KrooveCore] 信号触发：检测到播放结束，自动切歌...");
        this.next(true);
      }

      this.lastState = currentState;
    });

    // 3. 歌词换行更新 (对应你 C++ 的 LineChange)
    // 负责：精准的歌词同步广播，携带完整的行/词状态，前端直接消费
    this.engine.setOnLineChange(() => {
      this.broadcast({
        type: "lyric_line_change",
        line:         this.view.getInt32(40, true),   // 当前行索引  (offset 40)
        lineProgress: this.view.getFloat64(48, true), // 当前行进度  (offset 48)
        wordIndex:    this.view.getInt32(56, true),   // 当前字索引  (offset 56)
        wordProgress: this.view.getFloat64(64, true), // 当前字进度  (offset 64)
      });
    });
  }

  async bootstrap() {
    console.log("🛠️ Kroove 引擎正在启动...");

    const savedVolume = configManager.get('volume') || 70.0;
    this.engine.setVolume(savedVolume);
    console.log(`🔊 音量已恢复至: ${(savedVolume).toFixed(0)}%`);
    // 1. 从刚才建立的 JSON 配置文件中获取监控目录
    this.libraryFolders = configManager.get("libraryFolders") || [];

    if (this.libraryFolders.length > 0) {
      // 2. 正常运行：执行一次增量扫描
      await libraryManager.scanAll();

      // [New] 绑定扫描状态回调：向前端推送正在添加歌曲的通知
      libraryManager.onScanStatus = (active, count) => {
        this.broadcast({
          type: "library_scan_status",
          active: active,
          count: count
        });
      };

      // 3. 启动实时监听：当文件变动时自动执行 syncCurrentState
      libraryManager.initWatcher(() => this.syncCurrentState());
    } else {
      console.log("ℹ️ 当前曲库为空，请通过 API 添加音乐目录。");
    }

    const playlistCount = dbManager.db
      .prepare("SELECT count(*) as count FROM tracks")
      .get();
    console.log(`🎵 曲库就绪：共解析到 ${playlistCount.count} 首曲目。`);
    console.log(`📂 监控目录: [${this.libraryFolders.join(", ")}]`);

    playlist.loadAll();
    if (playlist.queue.length > 0) {
      // [Fix] 这里的 currentIndex 已经在 loadAll 中根据 last_played_id 恢复过了
      const lastId = playlist.current();
      if (lastId) {
         console.log(`🎬 自动恢复上次播放: ID ${lastId}`);
         this.playById(lastId);
      }
    }
  }

  /**
   * 动态添加并扫描新目录
   */
  async addLibraryFolder(targetPath) {
    const absolutePath = path.resolve(targetPath);
    await libraryManager.addFolder(absolutePath); // 内部现在已对接 JSON

    // 同步内存列表
    this.libraryFolders = configManager.get("libraryFolders") || [];
    console.log(`➕ 目录载入成功: ${absolutePath}`);
    
    // 刷新监控
    libraryManager.initWatcher(() => this.syncCurrentState());
    
    playlist.loadAll(); // 库有变更，重载内存队列
    this.broadcast({ type: "library_folders", folders: this.libraryFolders });
    this.broadcast({ type: "full_playlist", list: playlist.getFullList() });
    this.broadcast({ type: "queue_ids", ids: playlist.getQueueIds(), isBroadcast: true });
  }

  async removeLibraryFolder(targetPath) {
    const absolutePath = path.resolve(targetPath);
    configManager.removeLibraryFolder(absolutePath);
    this.libraryFolders = configManager.get("libraryFolders") || [];
    console.log(`➖ 目录移除成功: ${absolutePath}`);
    
    // 刷新监控
    libraryManager.initWatcher(() => this.syncCurrentState());
    
    this.broadcast({ type: "library_folders", folders: this.libraryFolders });
    this.broadcast({ type: "queue_ids", ids: playlist.getQueueIds(), isBroadcast: true });
  }

  playById(id) {
    const track = dbManager.getTrackById(id);
    if (!track) return;

    // 1. 更新后端“锁死”的当前播放数据
    this.currentPlaying = track;
    // 2. 更新列表管理器的游标，确保“下一首”没问题
    playlist.setById(id);

    console.log(`🎶 正在播放: ${track.title} | 歌手: ${track.artist}`);
    const layout = this.engine.load(track.path, track.lrc_path || "");
    this.lastLayout = layout; // 保存一份供纯同步时下发
    this.engine.play();

    this.broadcastUiUpdate(id, track, layout);
  }

  broadcastUiUpdate(id, track, layout) {
    const windowIds = playlist.getWindowIds(5, 15);
    const windowMetadata = windowIds.map((wid) => {
      const t = dbManager.getTrackById(wid);
      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        coverUrl: `http://127.0.0.1:6344/cover-by-id/${t.id}`,
      };
    });

    this.broadcast({
      type: "ui_update",
      id: id,
      current: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        lyrics: layout,
        coverUrl: `http://127.0.0.1:6344/cover-by-id/${id}`,
      },
      window: windowMetadata,
    });
  }

  next(isAuto = false) {
    const nextId = playlist.next(isAuto);
    if (nextId) this.playById(nextId);
  }

  prev() {
    const prevId = playlist.prev();
    if (prevId) this.playById(prevId);
  }

  pause() {
    this.engine.pause();
  }

  resume() {
    // 先检查当前底层引擎的状态
    const currentState = this.view.getInt32(0, true);
    // 3(通常是播放中) 和 4(通常是已暂停) 的情况下，文件是已经被加载进引擎内存的
    if (currentState === 3 || currentState === 4) {
      this.engine.play(); // 直接解除暂停即可
    } else {
      // 否则才算是真正的“冷启动”这首音乐
      const curId = playlist.current();
      if (curId) this.playById(curId);
    }
  }

  broadcast(data) {
    if (!this.wss) return; // 网络未就绪则静默
    const payload = JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send(payload);
    });
  }

  /**
   * 向指定客户端或全局同步当前全量状态
   */
  syncCurrentState() {
    // 【核心修复】由于 Watcher 只更新了 DB，必须手动让列表管理器重新从数据库载入最新全量轨道
    playlist.loadAll();

    // 优先从显式维护的 currentPlaying 同步，这比从索引取更安全
    if (this.currentPlaying) {
      this.broadcastUiUpdate(this.currentPlaying.id, this.currentPlaying, this.lastLayout);
    } else {
      // 如果内存没有，再尝试从持久化索引找回（针对刚开机的场景）
      const curId = playlist.current();
      if (curId) {
        const track = dbManager.getTrackById(curId);
        if (track) {
          this.currentPlaying = track;
          this.broadcastUiUpdate(curId, track, this.lastLayout);
        }
      } else {
        this.broadcast({ type: "ui_empty", message: "曲库为空或未开始播放" });
      }
    }
    // 下发一次当前处于监视中的目录状态用于前端渲染
    this.broadcast({ type: "library_folders", folders: this.libraryFolders });
    // 下发最新歌单大全
    this.broadcast({ type: "full_playlist", list: playlist.getFullList() });
    this.broadcast({
      type: "player_config",
      volume: configManager.get('volume'),
      playbackMode: playlist.mode // 从 playlistManager 获取当前模式
    });
    // [New] 下发轻量级 ID 序列，供前端虚拟列表索引
    this.broadcast({
      type: "queue_ids",
      ids: playlist.getQueueIds(),
      isBroadcast: true
    });
  }
  // coreManager.js
  async updateTrackManual(id, data) {
    dbManager.updateTrackManual(id, data);
    console.log(`✅ 已手动匹配曲目 [ID: ${id}] 的资源`);

    // 只要更新了曲目信息，就发起一次全局同步，确保列表和播放状态刷新
    this.syncCurrentState();
  }

  // 获取特定歌曲的所有元数据细节
  getTrackDetails(id) {
    return dbManager.getTrackById(id);
  }

  handleCommand(cmd) {
    switch (cmd.cmd) {
      case "get_sync":
        this.syncCurrentState();
        break; // 前端连接后主动请求一次同步
      case "set_mode":
        playlist.setMode(cmd.mode);
        break; // 切换播放模式
      case "play_prev":
        this.prev();
        break;
      case "play_next":
        this.next();
        break;
      case "play_by_id":
        this.playById(cmd.id);
        break;
      case "pause":
        this.pause();
        break;
      case "play":
        this.resume();
        break;
      case "seek":
        this.engine.seek(cmd.seconds, cmd.relative || false);
        break;
      case "set_volume":
        this.engine.setVolume(cmd.volume);
        configManager.set('volume', cmd.volume);
        break;
      case "set_mute":
        this.engine.setMute(cmd.mute);
        break;
      case "add_folder":
        this.addLibraryFolder(cmd.path);
        break;
      case "remove_folder":
        this.removeLibraryFolder(cmd.path);
        break;
      case "get_batch_details":
        // 允许通过指令批量获取详情 (WebSocket 渠道)
        if (cmd.ids && Array.isArray(cmd.ids)) {
          this.broadcast({
            type: "batch_details",
            details: playlist.getDetailsBatch(cmd.ids)
          });
        }
        break;
      case "search_playlist":
        // 支持搜索过滤请求
        const filteredIds = playlist.searchIds(cmd.query);
        this.broadcast({
          type: "queue_ids",
          ids: filteredIds
        });
        break;
    }
  }
}

module.exports = CoreManager;
