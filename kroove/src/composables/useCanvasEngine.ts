/**
 * useCanvasEngine.ts
 * Canvas 渲染引擎 Composable：管理画布初始化、渲染主循环。
 * 
 * 【架构原则】引擎只负责三件事：
 * 1. 按开关顺序调用三层绘制（背景层 -> 歌词层 -> 光标层）
 * 2. 提供数据（spectrumData、wordIndex 等）给渲染模式
 * 3. 管理 LyricNode 的生命周期（创建、离场、销毁）
 * 
 * 至于每一层具体怎么画，全权交由当前 LyricRenderMode 决定。
 */

import { ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { LyricNode } from './lyricSprites'
import { getRenderMode, loadRenderMode, isModeLoaded } from './render/index'

export function useCanvasEngine() {
  const playerStore = usePlayerStore()
  const lyricCanvasRef = ref<HTMLCanvasElement | null>(null)

  let ctx: CanvasRenderingContext2D | null = null
  let animationId: number | null = null
  let lastTimestamp = 0

  const activeNodes = shallowRef<LyricNode[]>([])

  // --- 画布初始化 ---
  const initCanvas = () => {
    if (!lyricCanvasRef.value) return
    const canvas = lyricCanvasRef.value
    const isPortrait = window.innerHeight > window.innerWidth
    // 竖屏模式下容器被 CSS 旋转 90°，逻辑尺寸需互换
    canvas.width = isPortrait ? window.innerHeight : window.innerWidth
    canvas.height = isPortrait ? window.innerWidth : window.innerHeight
    ctx = canvas.getContext('2d')
  }

  // --- 初始化当前模式的背景层 ---
  const initModeBackground = () => {
    if (!lyricCanvasRef.value) return
    const mode = getRenderMode(playerStore.lyricMode)
    mode.backgroundRenderer.init(lyricCanvasRef.value.width, lyricCanvasRef.value.height)
  }

  // --- 渲染主循环 ---
  const renderLoop = (timestamp: number) => {
    if (!ctx || !lyricCanvasRef.value) return

    const safeTimestamp = timestamp || performance.now()
    const dt = (safeTimestamp - lastTimestamp) / 16.67
    lastTimestamp = safeTimestamp

    ctx.clearRect(0, 0, lyricCanvasRef.value.width, lyricCanvasRef.value.height)

    const mode = getRenderMode(playerStore.lyricMode)

    // ==========================================
    // --- 状态更新阶段 ---
    // ==========================================

    // 1. 更新背景层状态（频谱数据交给模式自己处理）
    if (playerStore.enableSpectrum) {
      mode.backgroundRenderer.update(dt, playerStore.spectrumData)
    }

    // 2. 更新歌词层状态
    if (playerStore.enableLyricsAnimation) {
      for (let i = activeNodes.value.length - 1; i >= 0; i--) {
        const node = activeNodes.value[i]
        const wordIdx = node.isExiting ? -1 : playerStore.wordIndex
        node.update(dt, wordIdx)
        if (node.isExiting && node.opacity < 0.01) {
          activeNodes.value.splice(i, 1)
        }
      }
    }

    // ==========================================
    // --- 绘制阶段 (三层架构，由引擎保证顺序) ---
    // ==========================================

    // Layer 1 (底层): 背景/频谱动效 —— 模式自己决定画什么
    if (playerStore.enableSpectrum) {
      mode.backgroundRenderer.draw(ctx!)
    }

    // Layer 2 (中层): 歌词文本
    if (playerStore.enableLyricsAnimation) {
      activeNodes.value.forEach(node => node.drawLyrics(ctx!))
    }

    // Layer 3 (顶层): 追踪光标
    if (playerStore.enableLyricsAnimation) {
      activeNodes.value.forEach(node => node.drawCursor(ctx!))
    }

    animationId = requestAnimationFrame(renderLoop)
  }

  // --- 启动渲染循环 ---
  const startRenderLoop = () => {
    if (!animationId) {
      lastTimestamp = performance.now()
      animationId = requestAnimationFrame(renderLoop)
    }
  }

  // --- 停止渲染循环 ---
  const stopRenderLoop = () => {
    if (animationId) {
      cancelAnimationFrame(animationId)
      animationId = null
    }
  }

  // --- 清空所有精灵 ---
  const clearAll = () => {
    activeNodes.value = []
  }

  // --- 注入新歌词行 ---
  const injectLyricLine = async (lineData: any, lineProgress: number) => {
    if (!lyricCanvasRef.value || !ctx) return

    // 确保渲染模式已加载（动态懒加载保护）
    const modeId = playerStore.lyricMode
    if (!isModeLoaded(modeId)) {
      await loadRenderMode(modeId)
    }

    // 将之前的活跃节点标记为"准备离场"
    activeNodes.value.forEach(node => node.isExiting = true)

    const initialElapsed = lineProgress * (lineData.duration || 0) * 1000
    const newNode = new LyricNode(
      lineData,
      lyricCanvasRef.value.width,
      lyricCanvasRef.value.height,
      ctx,
      getRenderMode(modeId),
      Math.max(0, initialElapsed)
    )
    activeNodes.value.push(newNode)
  }

  // --- 监听歌词行变更 ---
  watch(() => playerStore.currentLineIndex, async (newIdx) => {
    if (!playerStore.enableLyricsAnimation || newIdx === -1) return

    const lyricsLines = playerStore.currentTrack?.lyrics?.lines
    if (!lyricsLines || !lyricsLines[newIdx]) return

    await injectLyricLine(lyricsLines[newIdx], playerStore.lineProgress)
  })

  // --- 全屏状态联动 ---
  watch(() => playerStore.isFullScreen, (isFull) => {
    if (isFull) {
      setTimeout(async () => {
        // 预加载当前渲染模式
        await loadRenderMode(playerStore.lyricMode)

        initCanvas()
        initModeBackground()

        // 校准当前歌词行
        const currentIdx = playerStore.currentLineIndex
        const lyricsLines = playerStore.currentTrack?.lyrics?.lines
        if (playerStore.enableLyricsAnimation && currentIdx >= 0 && lyricsLines && lyricsLines[currentIdx] && ctx && lyricCanvasRef.value) {
          const lineData = lyricsLines[currentIdx]
          const initialElapsed = playerStore.lineProgress * (lineData.duration || 0) * 1000
          const node = new LyricNode(
            lineData,
            lyricCanvasRef.value.width,
            lyricCanvasRef.value.height,
            ctx,
            getRenderMode(playerStore.lyricMode),
            Math.max(0, initialElapsed)
          )
          activeNodes.value = [node]
        }

        startRenderLoop()
      }, 150)
    } else {
      stopRenderLoop()
      clearAll()
    }
  })

  // --- 监听渲染模式切换：重新初始化背景 ---
  watch(() => playerStore.lyricMode, () => {
    if (playerStore.isFullScreen) {
      initModeBackground()
    }
  })

  // --- 画布初始化补丁：开关切换时重初始化 ---
  watch(() => (playerStore.enableLyricsAnimation || playerStore.enableSpectrum), (val) => {
    if (!playerStore.enableLyricsAnimation) {
      activeNodes.value = []
    }

    if (val && playerStore.isFullScreen) {
      setTimeout(() => {
        initCanvas()
        initModeBackground()
        startRenderLoop()
      }, 50)
    }
  })

  // --- 频谱可视化控制器 ---
  watch([() => playerStore.isFullScreen, () => playerStore.enableSpectrum], ([isFull, isSpec]) => {
    playerStore.sendCommand({
      cmd: 'toggle_visualizer',
      active: !!(isFull && isSpec),
      hz: 60
    })
  }, { immediate: true })

  // --- 生命周期 ---
  onMounted(() => {
    window.addEventListener('resize', initCanvas)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', initCanvas)
    stopRenderLoop()
  })

  return {
    lyricCanvasRef,
    activeNodes
  }
}
