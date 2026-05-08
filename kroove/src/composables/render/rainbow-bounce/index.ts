import type { LyricRenderMode, BackgroundRenderer } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import manifest from './manifest.json'

// ============================================================
//  String Resonance 背景渲染器："弦乐共振" 频谱动效
//  12 条横跨画布的琴弦，各自监听不同频段，随音乐能量振动。
//  低频弦粗而暖（深红铜），中频弦亮而金（琥珀），高频弦细而冷（银白）。
//  ============================================================
interface StringLine {
  y: number
  baseFreq: number
  phase: number
  amplitude: number
  targetAmplitude: number
  color: string
  glowColor: string
  bandStart: number
  bandEnd: number
  thickness: number
}

class StringResonanceRenderer implements BackgroundRenderer {
  private strings: StringLine[] = []
  private width = 0
  private height = 0
  private time = 0

  init(canvasWidth: number, canvasHeight: number) {
    this.width = canvasWidth
    this.height = canvasHeight
    this.time = 0

    const count = 12
    this.strings = []
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1) // 0 ~ 1
      const y = canvasHeight * 0.12 + t * canvasHeight * 0.76

      // 频段分配：下方低频，上方高频
      let bandStart: number, bandEnd: number
      let color: string, glowColor: string
      let thickness: number
      let baseFreq: number

      if (t < 0.33) {
        // 低频：粗、慢、暖（深红铜 → 琥珀）
        bandStart = Math.floor(0 + t * 60)
        bandEnd = bandStart + 15
        const warmth = t / 0.33
        color = warmth < 0.5 ? '#6B1A10' : '#A0522D'
        glowColor = warmth < 0.5 ? 'rgba(107, 26, 16, 0.6)' : 'rgba(160, 82, 45, 0.5)'
        thickness = 2.2 - warmth * 0.6
        baseFreq = 1.5 + warmth * 1.5
      } else if (t < 0.66) {
        // 中频：中等、金色
        bandStart = Math.floor(20 + (t - 0.33) * 120)
        bandEnd = bandStart + 25
        const mid = (t - 0.33) / 0.33
        color = mid < 0.5 ? '#B8860B' : '#DAA520'
        glowColor = mid < 0.5 ? 'rgba(184, 134, 11, 0.5)' : 'rgba(218, 165, 32, 0.4)'
        thickness = 1.5
        baseFreq = 3 + mid * 2
      } else {
        // 高频：细、快、冷（银 → 淡紫）
        bandStart = Math.floor(60 + (t - 0.66) * 120)
        bandEnd = Math.min(255, bandStart + 30)
        const high = (t - 0.66) / 0.34
        color = high < 0.5 ? '#A9A9A9' : '#B0A0C0'
        glowColor = high < 0.5 ? 'rgba(169, 169, 169, 0.4)' : 'rgba(176, 160, 192, 0.35)'
        thickness = 0.8
        baseFreq = 5 + high * 4
      }

      this.strings.push({
        y,
        baseFreq,
        phase: Math.random() * Math.PI * 2,
        amplitude: 0,
        targetAmplitude: 0,
        color,
        glowColor,
        bandStart,
        bandEnd,
        thickness
      })
    }
  }

  update(dt: number, spectrumData: number[]) {
    this.time += dt * 0.016

    this.strings.forEach(s => {
      // 计算频段平均能量
      let sum = 0
      let count = 0
      for (let i = s.bandStart; i < s.bandEnd && i < spectrumData.length; i++) {
        sum += spectrumData[i]
        count++
      }
      const energy = count > 0 ? sum / count : 0

      // 目标振幅：能量越高振幅越大（上限 40px）
      const energyBoost = Math.min(1, energy * 40)
      s.targetAmplitude = energyBoost * 40

      // 振幅平滑跟随
      s.amplitude += (s.targetAmplitude - s.amplitude) * 0.12 * dt

      // 相位推进：基础频率 + 能量带来的加速
      s.phase += (s.baseFreq * 0.08 + energyBoost * 0.15) * dt
    })
  }

  draw(ctx: CanvasRenderingContext2D) {
    // 1. 绘制每条弦的微弱"静止态"基线
    ctx.save()
    this.strings.forEach(s => {
      ctx.beginPath()
      ctx.strokeStyle = s.color
      ctx.globalAlpha = 0.08
      ctx.lineWidth = s.thickness
      ctx.moveTo(0, s.y)
      ctx.lineTo(this.width, s.y)
      ctx.stroke()
    })
    ctx.restore()

    // 2. 绘制振动弦（有振幅时才明显）
    ctx.save()
    this.strings.forEach(s => {
      if (s.amplitude < 0.5) return

      const segments = 80
      ctx.beginPath()

      for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * this.width
        // 复合波形：基波 + 二次谐波 + 少量噪声
        const wave1 = Math.sin(s.phase + i * 0.15) * s.amplitude
        const wave2 = Math.sin(s.phase * 1.7 + i * 0.25) * s.amplitude * 0.4
        const y = s.y + wave1 + wave2

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }

      const intensity = Math.min(1, s.amplitude / 20)

      // 外发光
      ctx.shadowColor = s.glowColor
      ctx.shadowBlur = 8 + intensity * 16
      ctx.strokeStyle = s.color
      ctx.globalAlpha = 0.25 + intensity * 0.55
      ctx.lineWidth = s.thickness * (1 + intensity * 0.8)
      ctx.stroke()

      // 核心亮线
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.4 + intensity * 0.5
      ctx.lineWidth = s.thickness * 0.5
      ctx.stroke()
    })
    ctx.restore()

    // 3. 绘制弦的"固定点"（两端的小圆点）
    ctx.save()
    this.strings.forEach(s => {
      ctx.fillStyle = s.color
      ctx.globalAlpha = 0.2
      ctx.beginPath()
      ctx.arc(8, s.y, 2, 0, Math.PI * 2)
      ctx.arc(this.width - 8, s.y, 2, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.restore()
  }
}

const stringBg = new StringResonanceRenderer()

// ============================================================
//  "共鸣文字" 歌词渲染：配合弦乐主题的暖色调、优雅浮动
//  ============================================================
export const RainbowBounceMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,

  backgroundRenderer: stringBg,

  // ====== 1. 初始化 ======
  initNode(node, tempCtx) {
    node.fontSize = 48

    const GAP = 14
    // 使用轻细字体，更有乐谱般的优雅感
    tempCtx.font = `300 ${node.fontSize}px "Segoe UI", "PingFang SC", sans-serif`

    let totalW = 0
    const widths: number[] = []
    node.words.forEach(w => {
      const ww = tempCtx.measureText(w.text).width
      widths.push(ww)
      totalW += ww + GAP
    })
    totalW -= GAP

    let cx = -totalW / 2
    node.words.forEach((w, i) => {
      w.targetRelX = cx + widths[i] / 2
      w.targetRelY = 0

      // 从弦的方向上下交替入场，像被弦弹出的音符
      const fromTop = i % 2 === 0
      w.originX = w.targetRelX + (Math.random() - 0.5) * 20
      w.originY = w.targetRelY + (fromTop ? -120 : 120)

      w.currentX = w.originX
      w.currentY = w.originY
      w.opacity = 0
      w.isActivated = false
      w.assemblyDelay = i * 35

      w.pluginData.width = widths[i]

      // 每个字独立的浮动相位
      w.pluginData.floatPhase = Math.random() * Math.PI * 2
      w.pluginData.floatSpeed = 0.02 + Math.random() * 0.02

      cx += widths[i] + GAP
    })

    if (node.words.length > 0) {
      const f = node.words[0]
      node.trackX = f.targetRelX + (f.pluginData.width || 20) / 2 + 6
      node.trackY = 0
      node.trackOpacity = 0
    }

    // 共鸣柱（光标）的状态
    node.pluginData.resonancePhase = 0
  },

  // ====== 2. 每帧更新 ======
  updateNode(node, dt, externalWordIndex) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.1
    const safeDt = Number.isFinite(dt) ? dt : 1

    node.pluginData.resonancePhase = (node.pluginData.resonancePhase || 0) + safeDt * 0.06

    // 激活策略
    node.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true
        w.activatedTime = performance.now()
      }
    })

    node.words.forEach((w) => {
      if (node.isExiting) {
        w.opacity *= 0.88
        w.currentY -= 1.5 * safeDt
        return
      }

      if (!w.isActivated) {
        w.opacity = 0
        return
      }

      const elapsed = performance.now() - w.activatedTime
      const delay = w.assemblyDelay
      const t = Math.max(0, elapsed - delay)

      if (t <= 0) {
        w.opacity = 0
        return
      }

      // 入场：带 overshoot 的弹性缓动
      const factor = Math.min(1, t / 500)
      const yEase = 1 - Math.pow(1 - factor, 4)
      const overshoot = Math.sin(factor * Math.PI * 1.2) * 0.08 * (1 - factor)

      w.currentX = w.originX + (w.targetRelX - w.originX) * yEase
      w.currentY = w.originY + (w.targetRelY - w.originY) * yEase + overshoot * 20

      // 稳定后的微小浮动（像音符在弦上轻轻漂浮）
      if (factor >= 1) {
        w.pluginData.floatPhase += w.pluginData.floatSpeed * safeDt
        w.currentY += Math.sin(w.pluginData.floatPhase) * 2
      }

      w.opacity = Math.min(1, t / 200)
    })

    // 光标追踪
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const aw = node.words[externalWordIndex]
      const halfW = (aw.pluginData.width || 20) / 2
      const tx = aw.targetRelX + halfW + 6
      const ty = aw.targetRelY + Math.sin(node.pluginData.resonancePhase) * 3

      node.trackOpacity += (1 - node.trackOpacity) * 0.12
      if (node.isFirstUpdate) {
        node.trackX = tx
        node.trackY = ty
        node.isFirstUpdate = false
      } else {
        node.trackX += (tx - node.trackX) * 0.2 * safeDt
        node.trackY += (ty - node.trackY) * 0.2 * safeDt
      }
    } else if (node.isExiting) {
      node.trackOpacity *= 0.85
    } else {
      node.isFirstUpdate = false
    }
  },

  // ====== 3. 绘制歌词（暖色调共鸣文字） ======
  drawLyrics(node, ctx) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.globalAlpha = Math.max(0, node.opacity)

    node.words.forEach((w, i) => {
      if (w.opacity < 0.005) return

      ctx.save()
      ctx.translate(w.currentX, w.currentY)

      ctx.font = `300 ${node.fontSize}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = node.opacity * w.opacity

      const isCurrent = i === node.activeWordIndex && !node.isExiting
      const isActivated = w.isActivated && !node.isExiting

      if (isCurrent) {
        // 当前字：亮白 + 金色强共鸣光晕
        ctx.fillStyle = '#FFFFFF'
        ctx.shadowColor = 'rgba(218, 165, 32, 0.8)'
        ctx.shadowBlur = 24
      } else if (isActivated) {
        // 已唱过的字：暖琥珀到深铜的渐变感
        const t = Math.min(1, (node.words.length - Math.abs(i - node.activeWordIndex)) / node.words.length)
        const r = 200 + t * 35
        const g = 170 - t * 40
        const b = 110 - t * 50
        ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`
        ctx.shadowColor = 'rgba(184, 134, 11, 0.25)'
        ctx.shadowBlur = 8
      } else {
        // 未激活：极暗的金色弱影，像远处乐谱上的休止符
        ctx.fillStyle = 'rgba(180, 160, 120, 0.12)'
        ctx.shadowBlur = 0
      }

      // 字母间距微调
      ctx.letterSpacing = '2px'
      ctx.fillText(w.text, 0, 0)
      ctx.restore()
    })

    ctx.restore()
  },

  // ====== 4. 绘制光标（共鸣柱） ======
  drawCursor(node, ctx) {
    if (node.trackOpacity < 0.01 || node.isExiting) return

    ctx.save()
    ctx.translate(node.x, node.y)

    const phase = node.pluginData.resonancePhase || 0
    const breath = 0.5 + 0.5 * Math.sin(phase * 1.3)
    ctx.globalAlpha = node.opacity * node.trackOpacity * (0.6 + breath * 0.4)

    const h = node.fontSize * 1.1
    const x = node.trackX
    const y = node.trackY

    // 共鸣柱主体：带微弱振动的竖线
    ctx.beginPath()
    const jitter = Math.sin(phase * 3) * 0.8
    ctx.moveTo(x + jitter, y - h / 2)
    ctx.lineTo(x - jitter, y + h / 2)

    ctx.strokeStyle = '#DAA520'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(218, 165, 32, 0.8)'
    ctx.shadowBlur = 14
    ctx.stroke()

    // 底部固定点：像弦桥上的小圆珠
    ctx.beginPath()
    ctx.arc(x, y + h / 2 + 4, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(218, 165, 32, 0.6)'
    ctx.fill()

    // 顶部微光
    ctx.beginPath()
    ctx.arc(x + jitter * 0.5, y - h / 2, 2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.fill()

    ctx.restore()
  }
}
