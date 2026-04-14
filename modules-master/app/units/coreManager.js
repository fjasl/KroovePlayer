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
    // 负责：精准的歌词同步广播，不需要在进度回调里顺带查歌词了
    this.engine.setOnLineChange(() => {
      // 这里可以直接从共享内存读取当前行索引，或者直接广播一个换行信号给前端
      // 这样前端就不需要实时计算哪一行该亮了
      this.broadcast({
        type: "lyric_line_change",
        line: this.view.getInt32(40, true), // 假设 offset 24 是当前行索引
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
      this.playById(playlist.queue[playlist.currentIndex]);
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
    playlist.loadAll(); // 库有变更，重载内存队列
    this.broadcast({ type: "library_folders", folders: this.libraryFolders });
    this.broadcast({ type: "full_playlist", list: playlist.getFullList() });
  }

  async removeLibraryFolder(targetPath) {
    const absolutePath = path.resolve(targetPath);
    configManager.removeLibraryFolder(absolutePath);
    this.libraryFolders = configManager.get("libraryFolders") || [];
    console.log(`➖ 目录移除成功: ${absolutePath}`);
    this.broadcast({ type: "library_folders", folders: this.libraryFolders });
  }

  playById(id) {
    const track = dbManager.getTrackById(id);
    if (!track) return;

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
    const curId = playlist.current();
    if (curId) {
      const track = dbManager.getTrackById(curId);
      // 这里千万不能再调 this.playById()，那会把进度从 0 开始重新 load。只推界面。
      this.broadcastUiUpdate(curId, track, this.lastLayout);
    } else {
      this.broadcast({ type: "ui_empty", message: "曲库为空或未开始播放" });
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
    }
  }
}

module.exports = CoreManager;
