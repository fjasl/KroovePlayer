import { defineStore } from 'pinia'
import { ref, reactive, watch } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const isPlaying = ref(false)
  const isShuffle = ref(false)
  const isRepeat = ref(false)
  const volume = ref(0)
  const isMuted = ref(false)

  const currentTime = ref(0)
  const duration = ref(0)

  const isFullScreen = ref(false) // 全屏页面是否展开
  const enableLyricsAnimation = ref(true) // 是否启用 Canvas 随机歌词
  const enableSpectrum = ref(false)        // 是否启用频谱可视化渲染
  const spectrumData = ref<number[]>(new Array(256).fill(0)) // 实时频谱数据
  const currentLineIndex = ref(-1)        // 当前播放的歌词行索引
  const lineProgress = ref(0)             // 当前行播放进度 0.0~1.0 (后端实时同步)
  const wordIndex = ref(-1)               // 当前字索引 (后端实时同步)
  const wordProgress = ref(0)             // 当前字进度 0.0~1.0 (后端实时同步)

  // 库扫描进度状态
  const scanActive = ref(false)
  const scanCount = ref(0)
  const searchQuery = ref('')
  const themeMode = ref<'light' | 'dark' | 'system'>('dark')

  // [New] UI 持续化状态
  const activeSidebarId = ref('home')
  const activeTab = ref('songs')

  // 接收后端传来的当前曲目源信息
  const currentTrack = reactive({
    id: -1,
    title: '准备就绪',
    artist: '--',
    album: '--',
    coverUrl: '',
    lyrics: null as any
  })

  // 视窗播放列表
  const windowPlaylist = ref<any[]>([])

  // 监控的库目录列表
  const libraryFolders = ref<string[]>([])

  // 全量曲目池 (旧的，兼容用)
  const fullPlaylist = ref<any[]>([])

  // [New] 虚拟列表支持：全量 ID 序列
  const queueIds = ref<number[]>([])
  // [New] 虚拟列表支持：元数据缓存池 (ID -> Metadata)
  const metadataMap = reactive<Map<number, any>>(new Map())

  // 全局 socket 管理
  let ws: WebSocket | null = null;
  let isDraggingProgress = false;
  let isInternalUpdate = false; // [New] 同步锁：防止接收后端同步信号后产生无限反馈环

  // [New] UI 状态：侧边栏展开
  const isSidebarExpanded = ref(false);

  const initConnection = () => {
    if (ws) return;
    ws = new WebSocket('ws://127.0.0.1:6344');

    ws.onopen = () => {
      console.log('✅ WebSocket Connected. Requesting Sync...');
      ws?.send(JSON.stringify({ cmd: 'get_sync' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'playback_status') {
          // 如果用户正在拖拽进度条，不强制通过后端回推抢占光标
          if (!isDraggingProgress) {
            currentTime.value = data.timePos;
          }
          // 在播放最初如果没有长度可以依靠心跳更新
          if (data.duration > 0) {
              duration.value = data.duration;
          }
          // 只有状态 3 才是明确在播放中，状态 4 是已暂停
          isPlaying.value = (data.state === 3);
          // 高频同步后端词级进度，驱动前端逐字动画
          if (data.wordIndex !== undefined) wordIndex.value = data.wordIndex;
          if (data.wordProgress !== undefined) wordProgress.value = data.wordProgress;
          if (data.lineProgress !== undefined) lineProgress.value = data.lineProgress;
        }

        // 2. 界面元数据刷新 (切歌时传来)
        if (data.type === 'ui_update') {
          currentTrack.id = data.id;
          currentTrack.title = data.current.title || '未知片段';
          currentTrack.artist = data.current.artist || '未知艺术家';
          currentTrack.album = data.current.album || '未知专辑';
          currentTrack.coverUrl = data.current.coverUrl || '';
          currentTrack.lyrics = data.current.lyrics || null;

          windowPlaylist.value = data.window || [];
        }

        // 2.1 实时频谱数据流更新
        if (data.type === 'visualizer_update') {
          spectrumData.value = data.spectrum || [];
        }

        // 3. 库目录刷新
        if (data.type === 'library_folders') {
          libraryFolders.value = data.folders || [];
        }

        // 4. 全量曲库刷新 (旧版本)
        if (data.type === 'full_playlist') {
          fullPlaylist.value = data.list || [];
          // 同时填充缓存
          data.list?.forEach((item: any) => metadataMap.set(item.id, item));
        }

        // [New] 4.1 轻量级 ID 序列刷新
        if (data.type === 'queue_ids') {
          // 【核心修复】如果当前正在搜索，且收到了全量库广播，则跳过本次本地更新以防止列表闪烁
          if (data.isBroadcast && searchQuery.value) {
            console.log("🔍 [SearchSync] 处于搜索中，忽略全量广播更新，静默重新同步过滤结果...");
            search(searchQuery.value);
            return; // 阻止本次全量覆盖
          }

          queueIds.value = data.ids || [];
        }

        // [New] 4.2 批量详情回流
        if (data.type === 'batch_details') {
          data.details?.forEach((item: any) => metadataMap.set(item.id, item));
        }
        // 5. 播放器配置刷新
        if (data.type === 'player_config') {
          // 1. 同步音量 (后端 0.0~1.0 -> 前端 0~100)
          if (data.volume !== undefined) {
            volume.value = Math.round(data.volume);
          }

          // 2. 同步播放模式
          if (data.playbackMode) {
            isShuffle.value = (data.playbackMode === 'shuffle')
            isRepeat.value = (data.playbackMode === 'repeat')
          }
        }

        // [New] 6. UI 状态同步恢复 (协同模式)
        if (data.type === 'ui_state') {
          if (data.uiState) {
            isInternalUpdate = true; // 开启同步锁

            if (data.uiState.activeSidebarId) activeSidebarId.value = data.uiState.activeSidebarId
            if (data.uiState.activeTab) activeTab.value = data.uiState.activeTab
            if (data.uiState.isFullScreen !== undefined) isFullScreen.value = data.uiState.isFullScreen
            if (data.uiState.themeMode) themeMode.value = data.uiState.themeMode
            if (data.uiState.enableLyricsAnimation !== undefined) enableLyricsAnimation.value = data.uiState.enableLyricsAnimation
            if (data.uiState.enableSpectrum !== undefined) enableSpectrum.value = data.uiState.enableSpectrum

            // [协同增强] 同步侧边栏展开状态
            if (data.uiState.isSidebarExpanded !== undefined) {
              isSidebarExpanded.value = data.uiState.isSidebarExpanded;
            }

            // [协同增强] 同步搜索关键词并触发过滤
            if (data.uiState.searchQuery !== undefined && data.uiState.searchQuery !== searchQuery.value) {
              searchQuery.value = data.uiState.searchQuery;
              search(searchQuery.value); // 在此窗口同步执行过滤
            }

            setTimeout(() => isInternalUpdate = false, 50); // 略微延时释放锁
          }
        }

        // 4. 处理实时歌词行变动（包含行进度和诌d级数据）
        if (data.type === 'lyric_line_change') {
          currentLineIndex.value = data.line;
          if (data.lineProgress !== undefined) lineProgress.value = data.lineProgress;
          if (data.wordIndex !== undefined) wordIndex.value = data.wordIndex;
          if (data.wordProgress !== undefined) wordProgress.value = data.wordProgress;
        }

        // 5. 处理库扫描进度
        if (data.type === 'library_scan_status') {
          scanActive.value = data.active;
          scanCount.value = data.count;
        }
      } catch (e) {
        console.warn('Socket message parse err:', e);
      }
    };

    ws.onclose = () => {
        console.warn('🔌 WebSocket 断开，正在尝试重连...');
        ws = null;
        setTimeout(() => initConnection(), 3000);
    }
  }

  // --- 发送给后端的控制方法 ---
  const sendCommand = (cmdObj: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmdObj));
    }
  }

  const togglePlay = () => sendCommand({ cmd: isPlaying.value ? 'pause' : 'play' });
  const playNext = () => sendCommand({ cmd: 'play_next' });
  const playPrev = () => sendCommand({ cmd: 'play_prev' });
  const playById = (id: number) => sendCommand({ cmd: 'play_by_id', id });
  const seek = (seconds: number) => sendCommand({ cmd: 'seek', seconds, relative: false });

  const search = (query: string) => {
    searchQuery.value = query;
    sendCommand({ cmd: 'search_playlist', query });
  }

  const syncMode = () => {
    let mode = 'sequential';
    if (isShuffle.value) mode = 'shuffle';
    if (isRepeat.value) mode = 'repeat';
    sendCommand({ cmd: 'set_mode', mode });
  }

  const toggleShuffle = () => {
    isShuffle.value = !isShuffle.value;
    if (isShuffle.value) isRepeat.value = false; // 互斥
    syncMode();
  }

  const toggleRepeat = () => {
    isRepeat.value = !isRepeat.value;
    if (isRepeat.value) isShuffle.value = false; // 互斥
    syncMode();
  }

  const setVolume = (vol: number) => sendCommand({ cmd: 'set_volume', volume: vol });

  const addFolder = (path: string) => sendCommand({ cmd: 'add_folder', path });
  const removeFolder = (path: string) => sendCommand({ cmd: 'remove_folder', path });

  // [New] 同步 UI 状态到后端
  const syncUiState = () => {
    sendCommand({
      cmd: 'set_ui_state',
      uiState: {
        activeSidebarId: activeSidebarId.value,
        activeTab: activeTab.value,
        isFullScreen: isFullScreen.value,
        themeMode: themeMode.value,
        isSidebarExpanded: isSidebarExpanded.value,
        searchQuery: searchQuery.value,
        enableLyricsAnimation: enableLyricsAnimation.value,
        enableSpectrum: enableSpectrum.value
      }
    });
  }

  // 监听关键 UI 状态变动并自动报备
  watch([activeSidebarId, activeTab, isFullScreen, themeMode, isSidebarExpanded, searchQuery, enableLyricsAnimation, enableSpectrum], () => {
    if (isInternalUpdate) return; // 如果是来自后端的同步信号，不反馈发送，防止死循环
    syncUiState();
  }, { deep: true });

  // [New] 批量拉取元数据
  const fetchBatchMetadata = async (ids: number[]) => {
    // 过滤掉已经缓存过的 ID
    const missingIds = ids.filter(id => !metadataMap.has(id));
    if (missingIds.length === 0) return;

    try {
      const response = await fetch('http://127.0.0.1:6344/api/track/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: missingIds })
      });
      const details = await response.json();
      details.forEach((item: any) => metadataMap.set(item.id, item));
    } catch (e) {
      console.error('Failed to fetch batch metadata:', e);
    }
  }

  // 供进度条拖拽组件调用，避免进度被频发心跳修正
  const setDragging = (state: boolean) => isDraggingProgress = state;

  const toggleMute = () => {
    isMuted.value = !isMuted.value;
    sendCommand({ cmd: 'set_mute', mute: isMuted.value });
  }
  const toggleFullScreen = () => (isFullScreen.value = !isFullScreen.value)

  return {
    isPlaying,
    isShuffle,
    isRepeat,
    volume,
    isMuted,
    currentTime,
    duration,
    isFullScreen,

    currentTrack,
    windowPlaylist,
    libraryFolders,
    fullPlaylist,
    queueIds,
    metadataMap,
    enableLyricsAnimation,
    currentLineIndex,
    lineProgress,
    wordIndex,
    wordProgress,
    scanActive,
    scanCount,
    searchQuery,
    themeMode,
    enableSpectrum,
    spectrumData,

    initConnection,
    fetchBatchMetadata,
    sendCommand,
    togglePlay,
    playNext,
    playPrev,
    playById,
    seek,
    search,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    addFolder,
    removeFolder,
    setDragging,
    toggleMute,
    toggleFullScreen,
    activeSidebarId,
    activeTab,
    isSidebarExpanded,
    syncUiState
  }
})
