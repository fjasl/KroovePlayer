import type { LyricRenderMode, BackgroundRenderer } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import manifest from './manifest.json'

// ============================================================
//  NeonPulse 背景渲染器：三层旋转频谱环（低频外 / 中频中 / 高频内）
// ============================================================
class NeonRingBackground implements BackgroundRenderer {
  private width = 0
  private height = 0
  private rotation = 0
  private smoothedSpectrum: number[] = []

  init(w: number, h: number) {
    this.width = w
    this.height = h
    this.smoothedSpectrum = new Array(256).fill(0)
  }

  update(dt: number, spectrum: number[]) {
    this.rotation += 0.003 * dt
    for (let i = 0; i < 256; i++) {
      const val = spectrum[i] || 0
      this.smoothedSpectrum[i] += (val - this.smoothedSpectrum[i]) * 0.12
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const cx = this.width / 2
    const cy = this.height / 2
    const baseR = Math.min(this.width, this.height) * 0.32

    const rings = [
      { range: [0, 20] as [number, number], baseR: baseR * 1.0, hue: 15, rotSpeed: 1.0 },
      { range: [20, 60] as [number, number], baseR: baseR * 0.72, hue: 180, rotSpeed: -0.7 },
      { range: [60, 180] as [number, number], baseR: baseR * 0.48, hue: 300, rotSpeed: 1.5 },
    ]

    ctx.globalCompositeOperation = 'screen'

    rings.forEach(ring => {
      const [start, end] = ring.range
      const count = end - start
      const segAngle = (Math.PI * 2) / count

      ctx.beginPath()
      for (let i = 0; i <= count; i++) {
        const idx = start + (i % count)
        const energy = this.smoothedSpectrum[idx] || 0
        const angle = i * segAngle + this.rotation * ring.rotSpeed
        const r = ring.baseR + energy * 90
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()

      ctx.lineWidth = 2.5
      ctx.strokeStyle = `hsla(${ring.hue}, 100%, 60%, 0.30)`
      ctx.stroke()

      ctx.lineWidth = 10
      ctx.strokeStyle = `hsla(${ring.hue}, 100%, 60%, 0.06)`
      ctx.stroke()
    })

    ctx.globalCompositeOperation = 'source-over'
  }
}

const neonBg = new NeonRingBackground()

export const NeonPulseMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,
  backgroundRenderer: neonBg,

  initNode(node: LyricNode, tempCtx: CanvasRenderingContext2D) {
    node.fontSize = 44
    node.y = tempCtx.canvas.height / 2

    const GAP = 14
    tempCtx.font = `bold ${node.fontSize}px sans-serif`

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

      // 从下方"深渊"弹射入场
      w.originX = w.targetRelX + (Math.random() - 0.5) * 140
      w.originY = w.targetRelY + 280 + Math.random() * 120

      w.currentX = w.originX
      w.currentY = w.originY
      w.opacity = 0
      w.assemblyDelay = i * 55

      w.pluginData.measuredWidth = widths[i]
      w.pluginData.phase = 0 // 0=waiting 1=shooting 2=arrived
      w.pluginData.arrivedTime = 0

      cx += widths[i] + GAP
    })

    if (node.words.length > 0) {
      node.trackX = node.words[0].targetRelX
      node.trackY = -node.fontSize * 0.9
    }
    node.trackOpacity = 0
  },

  updateNode(node: LyricNode, dt: number, externalWordIndex: number) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.08
    const safeDt = Number.isFinite(dt) ? dt : 1

    // 更新字的状态
    node.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true
        w.activatedTime = performance.now()
      }
      if (!w.isActivated) return

      if (!node.isExiting) {
        const elapsedSince = performance.now() - w.activatedTime

        if (w.pluginData.phase === 0 && elapsedSince > w.assemblyDelay) {
          w.pluginData.phase = 1
        }

        if (w.pluginData.phase === 1) {
          const dx = w.targetRelX - w.currentX
          const dy = w.targetRelY - w.currentY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 1.5) {
            w.pluginData.phase = 2
            w.pluginData.arrivedTime = performance.now()
            w.currentX = w.targetRelX
            w.currentY = w.targetRelY
          } else {
            const speed = Math.min(1.0, dist * 0.012) * safeDt
            w.currentX += dx * speed
            w.currentY += dy * speed
          }
          w.opacity = Math.min(1, w.opacity + 0.07 * safeDt)
        } else if (w.pluginData.phase === 2) {
          w.currentX = w.targetRelX + Math.sin(performance.now() * 0.003 + i) * 2
          w.currentY = w.targetRelY + Math.cos(performance.now() * 0.002 + i * 0.7) * 1.5
          w.opacity += (1 - w.opacity) * 0.08 * safeDt
        }
      } else {
        const dx = 0 - w.currentX
        const dy = 0 - w.currentY
        w.currentX += dx * 0.04 * safeDt
        w.currentY += dy * 0.04 * safeDt
        w.opacity *= 0.93
        w.pluginData.phase = 3
      }
    })

    // 光标追踪：始终悬停在当前激活字的正上方（DOTA2 英雄指针风格）
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const aw = node.words[externalWordIndex]
      node.trackOpacity += (1 - node.trackOpacity) * 0.2

      // 目标位置：字的上方中心 + 轻微呼吸偏移
      const breatheY = -node.fontSize * 0.85 + Math.sin(performance.now() * 0.005) * 4
      const targetX = aw.currentX
      const targetY = aw.targetRelY + breatheY

      if (node.isFirstUpdate) {
        node.trackX = targetX
        node.trackY = targetY
        node.isFirstUpdate = false
      } else {
        // 优雅平滑跟随，带轻微延迟感
        node.trackX += (targetX - node.trackX) * 0.18 * safeDt
        node.trackY += (targetY - node.trackY) * 0.18 * safeDt
      }
    } else {
      node.trackOpacity *= 0.88
      node.isFirstUpdate = false
    }
  },

  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(node.x, node.y)

    node.words.forEach((w, i) => {
      if (w.opacity < 0.005) return

      ctx.save()
      ctx.translate(w.currentX, w.currentY)

      const isCurrent = (i === node.activeWordIndex && !node.isExiting)
      const glow = isCurrent ? 18 : (w.pluginData.phase === 1 ? 14 : 3)

      ctx.font = `bold ${node.fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      if (glow > 0) {
        ctx.shadowColor = isCurrent ? '#00ffff' : '#ff66cc'
        ctx.shadowBlur = glow
      }

      ctx.fillStyle = isCurrent ? '#d0ffff' : 'rgba(255, 230, 255, 0.92)'
      ctx.globalAlpha = node.opacity * w.opacity
      ctx.fillText(w.text, 0, 0)
      ctx.restore()
    })

    ctx.restore()
  },

  drawCursor(node: LyricNode, ctx: CanvasRenderingContext2D) {
    if (node.trackOpacity < 0.01) return

    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.translate(node.trackX, node.trackY)

    const now = performance.now()
    const hue = (now * 0.04) % 360
    const alpha = node.opacity * node.trackOpacity

    // 1. 外环光晕（呼吸）
    const breathe = 0.85 + 0.15 * Math.sin(now * 0.006)
    ctx.save()
    ctx.globalAlpha = alpha * 0.25 * breathe
    ctx.fillStyle = `hsla(${hue}, 100%, 70%, 1)`
    ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.6)`
    ctx.shadowBlur = 18
    this._drawPointer(ctx, 0, 0, 22 * breathe)
    ctx.restore()

    // 2. 主体倒三角
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = `hsl(${hue}, 100%, 92%)`
    ctx.shadowColor = `hsl(${hue}, 100%, 60%)`
    ctx.shadowBlur = 10
    this._drawPointer(ctx, 0, 0, 14)
    ctx.restore()

    // 3. 中心高亮点
    ctx.save()
    ctx.globalAlpha = alpha * 0.9
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, -2, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.restore()
  },

  /** 绘制倒三角指针（DOTA2 英雄定位器风格） */
  _drawPointer(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const w = size * 0.9
    const h = size * 1.0
    const r = size * 0.15

    ctx.beginPath()
    // 左上角圆弧
    ctx.moveTo(x - w * 0.5 + r, y - h * 0.3)
    ctx.quadraticCurveTo(x - w * 0.5, y - h * 0.3, x - w * 0.5, y - h * 0.3 + r)
    // 左下斜边到尖端
    ctx.lineTo(x - r * 0.5, y + h * 0.6)
    // 尖端圆弧
    ctx.quadraticCurveTo(x, y + h * 0.75, x + r * 0.5, y + h * 0.6)
    // 右下斜边到右上
    ctx.lineTo(x + w * 0.5, y - h * 0.3 + r)
    // 右上角圆弧
    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.3, x + w * 0.5 - r, y - h * 0.3)
    // 顶部内凹弧线（让形状更像 DOTA2 指针）
    ctx.quadraticCurveTo(x, y - h * 0.55, x - w * 0.5 + r, y - h * 0.3)
    ctx.closePath()
    ctx.fill()
  }
}
