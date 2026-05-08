import type { LyricRenderMode } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import { NoOpBackgroundRenderer } from '../types'
import manifest from './manifest.json'

const noOpBg = new NoOpBackgroundRenderer()

export const RainbowBounceMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,
  backgroundRenderer: noOpBg,

  // ====== 1. 初始化：计算布局 ======
  initNode(node, tempCtx) {
    node.fontSize = 44

    const GAP = 10
    tempCtx.font = `bold ${node.fontSize}px sans-serif`

    // 计算整行总宽度
    let totalW = 0
    const widths: number[] = []
    node.words.forEach(w => {
      const ww = tempCtx.measureText(w.text).width
      widths.push(ww)
      totalW += ww + GAP
    })
    totalW -= GAP // 最后一个字不需要间距

    // 以行中心为原点，从左到右排列
    let cx = -totalW / 2
    node.words.forEach((w, i) => {
      w.targetRelX = cx + widths[i] / 2
      w.targetRelY = 0

      // 动画起点：从下方 100px 处飞入
      w.originX = w.targetRelX
      w.originY = w.targetRelY + 100

      w.currentX = w.originX
      w.currentY = w.originY
      w.opacity = 0
      w.isActivated = false
      w.assemblyDelay = i * 40 // 每个字间隔 40ms 依次入场

      // 预存宽度，避免 draw 时重复 measure
      w.pluginData.width = widths[i]

      cx += widths[i] + GAP
    })

    // 光标初始位置
    if (node.words.length > 0) {
      const f = node.words[0]
      node.trackX = f.targetRelX + (f.pluginData.width || 20) / 2 + 4
      node.trackY = 0
      node.trackOpacity = 0
    }

    // 自定义状态：光标闪烁相位
    node.pluginData.caretPhase = 0
  },

  // ====== 2. 每帧更新 ======
  updateNode(node, dt, externalWordIndex) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.12 // 整行淡入
    const safeDt = Number.isFinite(dt) ? dt : 1

    // 光标闪烁相位
    node.pluginData.caretPhase = (node.pluginData.caretPhase || 0) + safeDt * 0.08

    // 激活策略：字索引 <= externalWordIndex 的字都被标记为已激活
    node.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true
        w.activatedTime = performance.now()
      }
    })

    // 更新每个字的动画状态
    node.words.forEach((w, i) => {
      // --- 离场处理 ---
      if (node.isExiting) {
        w.opacity *= 0.9
        w.currentY -= 2 * safeDt
        return
      }

      // --- 未激活的字保持隐藏 ---
      if (!w.isActivated) {
        w.opacity = 0
        return
      }

      // --- 已激活：执行弹跳入场 ---
      const elapsed = performance.now() - w.activatedTime
      const delay = w.assemblyDelay
      const t = Math.max(0, elapsed - delay)

      if (t <= 0) {
        w.opacity = 0
        return
      }

      // 弹跳缓动： overshoot 效果
      const factor = Math.min(1, t / 400)
      const ease = 1 + Math.sin(factor * Math.PI * 1.5) * 0.15 // 过冲 15%
      const yEase = 1 - Math.pow(1 - factor, 3) // cubic out

      w.currentX = w.targetRelX
      w.currentY = w.originY + (w.targetRelY - w.originY) * yEase
      w.pluginData.bounceScale = ease
      w.opacity = Math.min(1, t / 150)
    })

    // ====== 光标追踪 ======
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const aw = node.words[externalWordIndex]
      const halfW = (aw.pluginData.width || 20) / 2
      const tx = aw.targetRelX + halfW + 4
      const ty = aw.targetRelY

      node.trackOpacity += (1 - node.trackOpacity) * 0.15
      if (node.isFirstUpdate) {
        node.trackX = tx
        node.trackY = ty
        node.isFirstUpdate = false
      } else {
        node.trackX += (tx - node.trackX) * 0.25 * safeDt
        node.trackY += (ty - node.trackY) * 0.25 * safeDt
      }
    } else if (node.isExiting) {
      node.trackOpacity *= 0.88
    } else {
      node.isFirstUpdate = false
    }
  },

  // ====== 3. 绘制歌词 ======
  drawLyrics(node, ctx) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.globalAlpha = Math.max(0, node.opacity)

    node.words.forEach((w, i) => {
      if (w.opacity < 0.005) return

      ctx.save()
      ctx.translate(w.currentX, w.currentY)

      // 弹跳缩放
      const scale = w.pluginData.bounceScale || 1.0
      if (scale !== 1.0) ctx.scale(scale, scale)

      ctx.font = `bold ${node.fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = node.opacity * w.opacity

      // 颜色：当前字白色高亮，已唱过的字彩虹色，未唱到的字灰色
      if (i === node.activeWordIndex && !node.isExiting) {
        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = 'rgba(255, 255, 255, 0.6)'
        ctx.shadowBlur = 16
      } else if (w.isActivated) {
        // 彩虹色：根据字索引在色相环上取色
        const hue = (i * 35) % 360
        ctx.fillStyle = `hsl(${hue}, 85%, 70%)`
        ctx.shadowBlur = 0
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
        ctx.shadowBlur = 0
      }

      ctx.fillText(w.text, 0, 0)
      ctx.restore()
    })

    ctx.restore()
  },

  // ====== 4. 绘制光标 ======
  drawCursor(node, ctx) {
    if (node.trackOpacity < 0.01 || node.isExiting) return

    ctx.save()
    ctx.translate(node.x, node.y)

    const blinkAlpha = 0.5 + 0.5 * Math.sin(node.pluginData.caretPhase || 0)
    ctx.globalAlpha = node.opacity * node.trackOpacity * blinkAlpha

    const caretH = node.fontSize * 1.0
    const caretW = 2.5

    ctx.fillStyle = '#fff'
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)'
    ctx.shadowBlur = 10

    ctx.beginPath()
    ctx.roundRect(
      node.trackX - caretW / 2,
      node.trackY - caretH / 2,
      caretW,
      caretH,
      1.25
    )
    ctx.fill()

    ctx.restore()
  }
}