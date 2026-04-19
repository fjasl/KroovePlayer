const { Engine } = require("../build/Release/ag_backend.node");
const path = require("path");
const fs = require("fs");
const dbManager = require("./dbManager");
const libraryManager = require("./libraryManager");
const playlist = require("./playlistManager");
const configManager = require("./configManager"); // 引入 JSON 配置
const MediaControlManager = require("./mediaControlManager");

// ==========================================
// --- 核心播放状态枚举 (与 C++ 保持一致) ---
// ==========================================
const PlayState = {
  IDLE: 0,
  LOADING: 1,
  BUFFERING: 2,
  PLAYING: 3,
  PAUSED: 4,
  STOPPED: 5,
  ERROR: 6
};

class CoreManager {
  constructor() {
    this.wss = null; // 初始不绑定网络
    this.engine = new Engine();
    // 2. 获取共享内存 Buffer 并建立视图
    this.sharedBuffer = this.engine.getSharedStatusBuffer();
    this.view = new DataView(
      this.sharedBuffer.buffer,
      this.sharedBuffer.byteOffset,
      this.sharedBuffer.byteLength
    );

    // [New] 建立频谱数据的直接映射视图 (Offset: 72, Count: 256)
    this.spectrumView = new Float32Array(
      this.sharedBuffer.buffer,
      this.sharedBuffer.byteOffset + 72,
      256
    );

    this.vizTimer = null;
    this.vizTimer = null;
    this.vizFrequency = 60;

    // ==========================================
    // --- 核心播放状态模型 (Playback Session) ---
    // ==========================================
    // 采用 Getter 模式直接透传共享内存数据，确保“零拷贝”高性能
    const self = this;
    this.playback = {
      // 1. 静态数据区 (仅在切歌时更新)
      item: null,      // 歌曲元数据
      lyrics: null,    // 歌词全文布局

      // 2. 动态状态区 (通过 Getter 实时访问共享内存)
      get state() { return self.view.getInt32(0, true); },
      get timePos() { return self.view.getFloat64(8, true); },
      get duration() { return self.view.getFloat64(16, true); },
      get volume() { return self.view.getFloat64(24, true); },
      get isPaused() { return !!self.view.getInt32(32, true); },
      get isMuted() { return !!self.view.getInt32(36, true); },
      get lineIndex() { return self.view.getInt32(40, true); },
      get lineProgress() { return self.view.getFloat64(48, true); },
      get wordIndex() { return self.view.getInt32(56, true); },
      get wordProgress() { return self.view.getFloat64(64, true); },

      // 辅助方法：导出当前状态快照（用于 JSON 广播）
      getSnapshot() {
        return {
          state: this.state,
          timePos: this.timePos,
          duration: this.duration,
          lineIndex: this.lineIndex,
          lineProgress: this.lineProgress,
          wordIndex: this.wordIndex,
          wordProgress: this.wordProgress,
          isPaused: this.isPaused,
          isMuted: this.isMuted
        };
      }
    };

    this.libraryFolders = []; // 实时维护监控目录列表
    this.playlist = playlist;
    this.lastState = -1; // 用于检测低频状态切换

    // 锁定引用防止被 GC
    global._engineRef = this.engine;

    this.initSync();
    this.mediaControl = new MediaControlManager(this);
  }

  /**
   * [Unified] 统一通知推送入口
   */
  notify(id, title, message, active = true, duration = 0) {
    this.broadcast({
      type: "notify",
      id,
      title,
      message,
      active,
      duration
    });
  }

  // [New] 独立的频谱广播任务
  startVisualizerBroadcast(hz = 60) {
    if (this.vizTimer) clearInterval(this.vizTimer);
    this.vizFrequency = hz;
    this.engine.setVisualizerFrequency(hz);

    this.vizTimer = setInterval(() => {
      // 只有在有连接且播放时才广播，减少无效开销
      if (this.wss && this.wss.clients.size > 0 && this.playback.state === PlayState.PLAYING) {
        this.broadcast({
          type: "visualizer_update",
          spectrum: Array.from(this.spectrumView)
        });
      }
    }, 1000 / hz);
  }

  stopVisualizerBroadcast() {
    if (this.vizTimer) {
      clearInterval(this.vizTimer);
      this.vizTimer = null;
    }
  }

  /**
   * 后期绑定网络总线
   */
  bindWss(wss) {
    this.wss = wss;
  }

  /**
   * 核心状态机中心 (State Machine Dispatcher)
   * 负责收拢所有：物理信号 (C++)、用户指令 (JS)、业务策略 (EOF/Retry)
   */
  async transition(event, data) {
    const prevState = this.lastState;
    const currentState = this.playback.state;

    switch (event) {
      case 'ENGINE_STATE_CHANGE':
        // 1. 处理播放结束 (EOF) -> 自动切歌策略
        if (currentState === PlayState.STOPPED && prevState !== PlayState.STOPPED) {
          console.log("🏁 [StateMachine] 检测到 EOF，通过状态机触发自动切歌...");
          this.next(true);
        }

        // 2. 处理错误 -> 容错策略
        if (currentState === PlayState.ERROR) {
          console.error("❌ [StateMachine] 引擎报错，尝试在 2 秒后重启或跳过...");
        }

        // 3. 通用状态切换广播
        this.broadcast({
          type: "playback_state_change",
          oldState: prevState,
          newState: currentState
        });
        break;

      case 'USER_LOAD':
        console.log(`📡 [StateMachine] 用户指令：准备载入 ${data.title}`);
        break;

      case 'USER_PLAY':
        console.log("▶️ [StateMachine] 用户指令：播放");
        break;

      case 'USER_PAUSE':
        console.log("⏸️ [StateMachine] 用户指令：暂停");
        break;
    }

    this.lastState = currentState;
  }


  // 在 CoreManager.js 的 initSync 中：
  initSync() {
    // 1. 高频状态更新 (进度探测)
    this.engine.setOnStatusUpdate(() => {
      const s = this.playback.state;
      if (s === PlayState.PLAYING || s === PlayState.PAUSED || s === PlayState.BUFFERING) {
        this.broadcast({
          type: "playback_status",
          ...this.playback.getSnapshot()
        });

        // 同步给 MPRIS (系统媒体控制)
        if (this.mediaControl) this.mediaControl.updatePosition();
      }
    });

    // 2. 状态切换更新 -> 对接状态机
    this.engine.setOnStateChange(() => {
      this.transition('ENGINE_STATE_CHANGE');
      if (this.mediaControl) this.mediaControl.updateStatus();
    });

    // 3. 歌词换行更新
    this.engine.setOnLineChange(() => {
      this.broadcast({
        type: "lyric_line_change",
        line: this.playback.lineIndex,
        lineProgress: this.playback.lineProgress,
        wordIndex: this.playback.wordIndex,
        wordProgress: this.playback.wordProgress,
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

      // [New] 绑定扫描状态回调：只在扫描结束时通知结算结果
      libraryManager.onScanStatus = (active, count, scanType, lastFile) => {
        // 如果扫描还在进行中，直接返回，不再骚扰前端显示具体文件
        if (active) return;

        // 只有在结束时 (active=false) 才发送结算通知
        if (scanType === 'add') {
            this.notify("library_op", '曲库更新成功', `已成功添加 ${count} 首新歌曲`, false);
        } else if (scanType === 'remove') {
            this.notify("library_op", '清理完成', `已从库中移除失效资源`, false);
        }
      };

      // [New] 绑定通用通知回调 (如歌词自动关联等)
      libraryManager.onNotify = (id, title, message, active) => {
        this.notify(id, title, message, active);
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
        console.log(`🎬 自动恢复上次播放: ID ${lastId} (仅载入不播放)`);
        this.loadById(lastId);
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
    
    // [Unified] 移除目录开始
    this.notify("folder_op", "正在移除目录", "正在从库中清理失效歌曲...");

    // 清理数据库：移除不再属于任何监听目录的歌曲
    const pruneCount = dbManager.pruneOrphanedTracks(this.libraryFolders);
    console.log(`➖ 目录移除成功: ${absolutePath} (从数据库清理了 ${pruneCount} 首不再监听的歌曲)`);

    // 刷新监控
    libraryManager.initWatcher(() => this.syncCurrentState());

    playlist.loadAll(); // 库有变更，重载内存队列
    this.syncCurrentState(); // 发起一次全量同步，通知前端列表已变动

    // [Unified] 移除目录成功 (active: false 会自动触发 3s 倒计时销毁)
    this.notify("folder_op", "目录移除成功", `已成功清理 ${pruneCount} 首失效歌曲`, false);

    this.broadcast({ type: "library_folders", folders: this.libraryFolders });
    this.broadcast({ type: "queue_ids", ids: playlist.getQueueIds(), isBroadcast: true });
  }

  _prepareTrack(id) {
    const track = dbManager.getTrackById(id);
    if (!track) return null;

    // 1. 更新后端播放数据快照
    this.playback.item = track;
    // 2. 更新列表管理器的游标，确保“下一首”没问题
    playlist.setById(id);

    const layout = this.engine.load(track.path, track.lrc_path || "");
    this.playback.lyrics = layout; // 保存一份供纯同步时下发
    
    return { track, layout };
  }

  playById(id) {
    const result = this._prepareTrack(id);
    if (!result) return;

    this.transition('USER_LOAD', result.track);
    this.transition('USER_PLAY');
    
    this.engine.play();
    this.broadcastUiUpdate(id, result.track, result.layout);
  }

  loadById(id) {
    const result = this._prepareTrack(id);
    if (!result) return;

    this.transition('USER_LOAD', result.track);
    this.broadcastUiUpdate(id, result.track, result.layout);
  }

  broadcastUiUpdate(id, track, layout) {
    if (this.mediaControl) this.mediaControl.updateMetadata(track);
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
    this.transition('USER_PAUSE');
    this.engine.pause();
  }

  resume() {
    const s = this.playback.state;
    // 3(通常是播放中) 和 4(通常是已暂停) 的情况下，文件是已经被加载进引擎内存的
    if (s === PlayState.PLAYING || s === PlayState.PAUSED) {
      this.transition('USER_PLAY');
      this.engine.play(); // 直接解除暂停即可
    } else {
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
   * [Refactor] 支持 targetWs 参数，实现新连入客户端的“一键同步”
   */
  syncCurrentState(targetWs = null) {
    // 1. 确保内存列表是最新的
    playlist.loadAll();

    // 2. 准备全量快照
    const syncData = [
      {
        type: "library_folders",
        folders: this.libraryFolders 
      },
      {
        type: "full_playlist",
        list: playlist.getFullList() 
      },
      {
        type: "player_config",
        volume: configManager.get('volume'),
        playbackMode: playlist.mode
      },
      {
        type: "ui_state",
        uiState: configManager.get('uiState')
      },
      {
        type: "queue_ids",
        ids: playlist.getQueueIds(),
        isBroadcast: true
      }
    ];

    // 3. 注入当前的播放上下文与状态
    if (this.playback.item) {
      const windowIds = playlist.getWindowIds(5, 15);
      syncData.push({
        type: "ui_update",
        id: this.playback.item.id,
        current: {
          ...this.playback.item,
          lyrics: this.playback.lyrics,
          coverUrl: `http://127.0.0.1:6344/cover-by-id/${this.playback.item.id}`,
        },
        window: windowIds.map(wid => {
           const t = dbManager.getTrackById(wid);
           return { id: t.id, title: t.title, artist: t.artist, duration: t.duration, coverUrl: `http://127.0.0.1:6344/cover-by-id/${t.id}` };
        })
      });
      // 注入当前进度与状态机状态
      syncData.push({
        type: "playback_status",
        ...this.playback.getSnapshot()
      });
    } else {
      syncData.push({ type: "ui_empty", message: "尚未开始播放" });
    }

    // 4. 执行发送
    if (targetWs) {
      // 针对单一客户端：通过一次性批量发送减少网络往返
      syncData.forEach(msg => targetWs.send(JSON.stringify(msg)));
    } else {
      // 针对全局广播
      syncData.forEach(msg => this.broadcast(msg));
    }
  }
  // coreManager.js
  async updateTrackManual(id, data) {
    dbManager.updateTrackManual(id, data);
    console.log(`✅ 已手动匹配曲目 [ID: ${id}] 的资源`);
    
    // [Unified] 通知前端资源已变动
    this.notify("manual_update", "资源变动", "曲目资源已手动更新", false);

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
      case "toggle_visualizer":
        if (cmd.active) {
          this.startVisualizerBroadcast(cmd.hz || 60);
        } else {
          this.stopVisualizerBroadcast();
        }
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
      case "set_ui_state":
        if (cmd.uiState) {
          configManager.set('uiState', cmd.uiState);
          // [Multi-Window Sync] 立即向所有连接的 UI 窗口转发状态，实现多端同步
          this.broadcast({ type: "ui_state", uiState: cmd.uiState });
        }
        break;
    }
  }
}

module.exports = CoreManager;
