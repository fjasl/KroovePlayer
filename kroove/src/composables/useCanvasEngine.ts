/**
 * useCanvasEngine.ts
 * Canvas 渲染引擎 Composable：管理画布初始化、渲染主循环、歌词/频谱渲染、节奏检测。
 * 从 FullScreenPlayer.vue 中分离，使主组件只关注 UI 布局。
 */

import { ref, shallowRef, watch, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { LyricNode, PolygonSprite } from './lyricSprites'
import { getRenderMode } from './render/index'

export function useCanvasEngine() {
  const playerStore = usePlayerStore()
  const lyricCanvasRef = ref<HTMLCanvasElement | null>(null)

  let ctx: CanvasRenderingContext2D | null = null
  let animationId: number | null = null
  let lastTimestamp = 0

  const activeNodes = shallowRef<LyricNode[]>([])
  const activePolygons = shallowRef<PolygonSprite[]>([])

  // --- 节奏跟踪状态 (自适应包络 + 差分检测) ---
  let smoothedEnergies = { low: 0, mid: 0, high: 0 }
  let lastEnergies = { low: 0, mid: 0, high: 0 }
  let lastSpawnTimes = { low: 0, mid: 0, high: 0 }

  const BEAT_COOLDOWN = 60
  const SMOOTH_FACTOR_FAST = 0.88

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

  // --- 频谱节奏检测器 ---
  const checkBeat = (current: number, band: 'low' | 'mid' | 'high', minEnergy: number, now: number): boolean => {
    // 1. 指数移动平均包络 (自适应背景)
    smoothedEnergies[band] = (smoothedEnergies[band] * SMOOTH_FACTOR_FAST) + (current * (1 - SMOOTH_FACTOR_FAST))

    // 2. 上升沿激发检测 (差分检测)
    const last = lastEnergies[band]
    const delta = current - last
    const deltaThreshold = Math.max(minEnergy * 2, last * 0.4)

    // 条件 A: 峰值比例检测
    const peakCondition = current > minEnergy && current > smoothedEnergies[band] * 1.3
    // 条件 B: 能量暴涨检测 (Rising Edge)
    const deltaCondition = current > minEnergy && delta > deltaThreshold

    let isBeat = false
    if ((peakCondition || deltaCondition) && (now - lastSpawnTimes[band]) > BEAT_COOLDOWN) {
      lastSpawnTimes[band] = now
      isBeat = true
    }

    lastEnergies[band] = current
    return isBeat
  }

  // --- 渲染主循环 ---
  const renderLoop = (timestamp: number) => {
    if (!ctx || !lyricCanvasRef.value) return

    const safeTimestamp = timestamp || performance.now()
    const dt = (safeTimestamp - lastTimestamp) / 16.67
    lastTimestamp = safeTimestamp

    ctx.clearRect(0, 0, lyricCanvasRef.value.width, lyricCanvasRef.value.height)

    // --- 状态更新阶段 ---
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

    // --- [频谱渲染] 中心爆裂多边形 ---
    if (playerStore.enableSpectrum && playerStore.spectrumData.length > 0) {
      const data = playerStore.spectrumData
      const canvas = lyricCanvasRef.value

      // 获取频段峰值
      const getPeak = (start: number, end: number) => {
        let max = 0
        for (let i = start; i < end; i++) {
          if (data[i] > max) max = data[i]
        }
        return max
      }

      const lowPeak = getPeak(0, 15)
      const midPeak = getPeak(15, 60)
      const highPeak = getPeak(60, 180)

      const now = performance.now()

      // 自适应频率检测
      if (playerStore.isPlaying) {
        // 低频：底鼓/基调
        if (checkBeat(lowPeak, 'low', 0.005, now)) {
          activePolygons.value.push(new PolygonSprite(canvas.width, canvas.height, 3 + Math.floor(Math.random() * 2), lowPeak))
        }
        // 中频：军鼓/打击乐
        if (checkBeat(midPeak, 'mid', 0.004, now)) {
          activePolygons.value.push(new PolygonSprite(canvas.width, canvas.height, 5 + Math.floor(Math.random() * 2), midPeak))
        }
        // 高频：点缀/镲片
        if (checkBeat(highPeak, 'high', 0.003, now)) {
          activePolygons.value.push(new PolygonSprite(canvas.width, canvas.height, 8, highPeak * 1.2))
        }
      }

      // 更新多边形
      for (let i = activePolygons.value.length - 1; i >= 0; i--) {
        const poly = activePolygons.value[i]
        poly.update(dt)
        if (poly.opacity <= 0) {
          activePolygons.value.splice(i, 1)
        }
      }
    }

    // ==========================================
    // --- 绘制阶段 (三层架构) ---
    // ==========================================

    // Layer 1 (底层): 频谱多边形
    if (playerStore.enableSpectrum) {
      activePolygons.value.forEach(poly => poly.draw(ctx!))
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
    activePolygons.value = []
  }

  // --- 注入新歌词行 ---
  const injectLyricLine = (lineData: any, lineProgress: number) => {
    if (!lyricCanvasRef.value || !ctx) return

    // 将之前的活跃节点标记为"准备离场"
    activeNodes.value.forEach(node => node.isExiting = true)

    const initialElapsed = lineProgress * (lineData.duration || 0) * 1000
    const newNode = new LyricNode(
      lineData,
      lyricCanvasRef.value.width,
      lyricCanvasRef.value.height,
      ctx,
      getRenderMode(playerStore.lyricMode),
      Math.max(0, initialElapsed)
    )
    activeNodes.value.push(newNode)
  }

  // --- 监听歌词行变更 ---
  watch(() => playerStore.currentLineIndex, (newIdx) => {
    if (!playerStore.enableLyricsAnimation || newIdx === -1) return

    const lyricsLines = playerStore.currentTrack?.lyrics?.lines
    if (!lyricsLines || !lyricsLines[newIdx]) return

    injectLyricLine(lyricsLines[newIdx], playerStore.lineProgress)
  })

  // --- 全屏状态联动 ---
  watch(() => playerStore.isFullScreen, (isFull) => {
    if (isFull) {
      setTimeout(() => {
        initCanvas()

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

  // --- 画布初始化补丁：开关切换时重初始化 ---
  watch(() => (playerStore.enableLyricsAnimation || playerStore.enableSpectrum), (val) => {
    if (!playerStore.enableLyricsAnimation) {
      activeNodes.value = []
    }

    if (val && playerStore.isFullScreen) {
      setTimeout(() => {
        initCanvas()
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
    activeNodes,
    activePolygons
  }
}
