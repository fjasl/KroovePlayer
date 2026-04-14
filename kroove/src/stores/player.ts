import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

export const usePlayerStore = defineStore('player', () => {
  const isPlaying = ref(false)
  const isShuffle = ref(false)
  const isRepeat = ref(false)
  const volume = ref(0)
  const isMuted = ref(false)

  const currentTime = ref(0)
  const duration = ref(0)

  const isFullScreen = ref(false) // 全屏页面是否展开

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

        // 1. 播放进度刷新 (50ms高压)
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
            isShuffle.value = (data.playbackMode === 'shuffle');
            isRepeat.value = (data.playbackMode === 'repeat');
          }
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

    initConnection,
    fetchBatchMetadata,
    togglePlay,
    playNext,
    playPrev,
    playById,
    seek,
    toggleShuffle,
    toggleRepeat,
    setVolume,
    addFolder,
    removeFolder,
    setDragging,
    toggleMute,
    toggleFullScreen
  }
})
