import type { LyricRenderMode } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import { pinyin } from 'pinyin-pro'
import manifest from './manifest.json'

/**
 * 判断字符是否为 CJK 汉字
 */
function isCJK(char: string): boolean {
  if (!char) return false
  const code = char.codePointAt(0) || 0
  return (code >= 0x4E00 && code <= 0x9FFF)   // 基本区
      || (code >= 0x3400 && code <= 0x4DBF)   // 扩展A
      || (code >= 0x20000 && code <= 0x2A6DF) // 扩展B
}

/**
 * 获取单个字的拼音 (无声调)
 */
function getPinyinForChar(char: string): string {
  if (!isCJK(char)) return ''
  const result = pinyin(char, { toneType: 'none', type: 'array' })
  return result[0] || ''
}

/**
 * 打字机渲染模式 — IME 输入法模拟
 *
 * 核心视觉流程 (每个字经历三个阶段)：
 *
 *   阶段 1 — 拼音输入：上方显示拼音字母逐个敲入动画
 *                      例如: j → ji → jiu → jiù
 *   阶段 2 — 选字确认：拼音淡出，汉字从半透明放大状态弹入确认
 *   阶段 3 — 已完成：  汉字保持稳定，亮度略降，等待下一个字
 *
 * 底部配有全行进度条追踪打字进度
 */
export const TypewriterMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,

  // ==========================================
  // 初始化
  // ==========================================
  initNode(node: LyricNode, tempCtx: CanvasRenderingContext2D) {
    node.fontSize = 40
    node.y = node.x > 0 ? (node.y * 0.3 + (tempCtx.canvas.height / 2) * 0.7) : node.y

    const GAP = 6
    const PINYIN_FONT_SIZE = 16

    if (node.words && node.words.length > 0) {
      tempCtx.font = `bold ${node.fontSize}px sans-serif`
      let totalW = 0
      const wordWidths: number[] = []

      node.words.forEach((w) => {
        const wWidth = tempCtx.measureText(w.text).width
        wordWidths.push(wWidth)
        totalW += wWidth + GAP
      })
      totalW -= GAP

      let currentX = -totalW / 2
      node.words.forEach((sprite: WordSprite, i: number) => {
        sprite.targetRelX = currentX + wordWidths[i] / 2
        sprite.targetRelY = 0

        sprite.originX = sprite.targetRelX
        sprite.originY = 0 // 字不做位移，靠 scale 和 opacity 做动画

        sprite.currentX = sprite.targetRelX
        sprite.currentY = 0
        sprite.opacity = 0
        sprite.assemblyDelay = 0

        sprite.pluginData.measuredWidth = wordWidths[i]

        // --- IME 拼音数据预计算 ---
        const py = getPinyinForChar(sprite.text)
        sprite.pluginData.pinyin = py               // 完整拼音字符串
        sprite.pluginData.pinyinLen = py.length      // 拼音总字母数
        sprite.pluginData.hasPinyin = py.length > 0  // 是否是有拼音的汉字
        sprite.pluginData.charScale = 1.0            // 字体缩放 (选字弹入用)
        sprite.pluginData.pinyinOpacity = 0          // 拼音区域整体透明度
        sprite.pluginData.charPhase = 0              // 0=等待, 1=拼音输入中, 2=选字确认, 3=已完成

        currentX += wordWidths[i] + GAP
      })
    } else {
      const sprite = node.words[0]
      sprite.targetRelX = 0
      sprite.targetRelY = 0
      sprite.originX = 0
      sprite.originY = 0
      sprite.currentX = 0
      sprite.currentY = 0
      sprite.isActivated = true
      sprite.pluginData.measuredWidth = tempCtx.measureText(sprite.text).width
      sprite.pluginData.pinyin = ''
      sprite.pluginData.pinyinLen = 0
      sprite.pluginData.hasPinyin = false
      sprite.pluginData.charScale = 1.0
      sprite.pluginData.pinyinOpacity = 0
      sprite.pluginData.charPhase = 3
    }

    // 全局打字机状态
    node.pluginData.caretPhase = 0
    node.pluginData.typedRightEdge = 0
    node.pluginData.pinyinFontSize = PINYIN_FONT_SIZE

    if (node.words.length > 0) {
      const first = node.words[0]
      node.trackX = first.targetRelX - (first.pluginData.measuredWidth || 20) / 2 - 2
      node.trackY = 0
      node.trackW = 2.5
      node.trackOpacity = 0
    }
  },

  // ==========================================
  // 每帧更新
  // ==========================================
  updateNode(node: LyricNode, dt: number, externalWordIndex: number) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.12

    const safeDt = Number.isFinite(dt) ? dt : 1

    // 光标闪烁
    node.pluginData.caretPhase = (node.pluginData.caretPhase || 0) + safeDt * 0.08
    if (node.pluginData.caretPhase > Math.PI * 2) node.pluginData.caretPhase -= Math.PI * 2

    // --- 拼音输入阶段时长计算 ---
    // 整体输入周期：一个字的 duration 按比例拆分
    //   拼音输入 = 总时长的 60%   选字确认 = 总时长的 40%
    const PINYIN_PHASE_RATIO = 0.6
    const CONFIRM_PHASE_RATIO = 0.4

    node.words.forEach((w, i) => {
      if (!node.isExiting) {
        // 激活判定
        if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
          w.isActivated = true
          w.activatedTime = performance.now()
          w.pluginData.charPhase = w.pluginData.hasPinyin ? 1 : 2 // 有拼音→输入阶段，无拼音→直接选字确认
        }

        if (!w.isActivated) return

        const elapsed = performance.now() - w.activatedTime
        const totalDur = Math.max(w.duration, 300) // 最低保证 300ms 动画时长
        const pinyinDur = totalDur * PINYIN_PHASE_RATIO
        const confirmDur = totalDur * CONFIRM_PHASE_RATIO

        if (w.pluginData.hasPinyin && w.pluginData.charPhase === 1) {
          // === 阶段 1：拼音字母逐个敲入 ===
          const pinyinProgress = Math.min(1, elapsed / pinyinDur)
          // 当前显示几个字母 (向上取整保证第一帧至少显示 1 个)
          w.pluginData.visiblePinyinCount = Math.ceil(pinyinProgress * w.pluginData.pinyinLen)
          w.pluginData.pinyinOpacity = Math.min(1, pinyinProgress * 2) // 快速淡入

          // 汉字在此阶段保持极淡的预览
          w.opacity = 0.08
          w.pluginData.charScale = 1.15 // 略放大，等待确认

          if (elapsed >= pinyinDur) {
            w.pluginData.charPhase = 2 // 进入选字确认阶段
            w.pluginData.confirmStartTime = performance.now()
          }
        } else if (w.pluginData.charPhase === 2) {
          // === 阶段 2：选字确认 ===
          const confirmElapsed = w.pluginData.hasPinyin
            ? performance.now() - (w.pluginData.confirmStartTime || performance.now())
            : elapsed
          const confirmT = Math.min(1, confirmElapsed / Math.max(confirmDur, 150))
          // ease-out cubic
          const ease = 1 - Math.pow(1 - confirmT, 3)

          // 拼音淡出
          w.pluginData.pinyinOpacity = Math.max(0, 1 - ease * 2) // 快速消失
          w.pluginData.visiblePinyinCount = w.pluginData.pinyinLen // 保持完整显示直到淡出

          // 汉字弹入：从 1.15x 缩回 1.0x，透明度从 0.08 到 1
          w.pluginData.charScale = 1.15 - 0.15 * ease
          w.opacity = 0.08 + 0.92 * ease

          // 微弹效果：过冲后回弹
          if (confirmT > 0.5 && confirmT < 1) {
            const bounce = Math.sin((confirmT - 0.5) * Math.PI / 0.5) * 0.03
            w.pluginData.charScale -= bounce
          }

          if (confirmT >= 1) {
            w.pluginData.charPhase = 3
            w.opacity = 1
            w.pluginData.charScale = 1.0
            w.pluginData.pinyinOpacity = 0
          }
        } else if (w.pluginData.charPhase === 3) {
          // === 阶段 3：已完成 ===
          w.opacity = 1
          w.pluginData.charScale = 1.0
          w.pluginData.pinyinOpacity = 0
        }

        w.currentX = w.targetRelX
        w.currentY = w.targetRelY
      } else {
        // === 离场 ===
        w.opacity *= (0.93 - i * 0.003)
        w.currentY -= 1.8 * safeDt
        w.currentX += (Math.random() - 0.5) * 0.8 * safeDt
        w.pluginData.pinyinOpacity = 0
      }
    })

    // --- 光标追踪 ---
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const activeWord = node.words[externalWordIndex]
      const halfW = (activeWord.pluginData.measuredWidth || 20) / 2
      const targetX = activeWord.targetRelX + halfW + 3
      const targetY = activeWord.targetRelY

      node.trackOpacity += (1 - node.trackOpacity) * 0.15

      if (node.isFirstUpdate) {
        node.trackX = targetX
        node.trackY = targetY
        node.isFirstUpdate = false
      } else {
        node.trackX += (targetX - node.trackX) * 0.25 * safeDt
        node.trackY += (targetY - node.trackY) * 0.25 * safeDt
      }

      node.pluginData.typedRightEdge = activeWord.targetRelX + halfW
    } else if (node.isExiting) {
      node.trackOpacity *= 0.88
    } else {
      node.isFirstUpdate = false
    }
  },

  // ==========================================
  // 绘制层 2：歌词文本 + 拼音
  // ==========================================
  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.globalAlpha = Math.max(0, node.opacity)

    const pyFontSize = node.pluginData.pinyinFontSize || 16

    node.words.forEach((w, i) => {
      if (w.opacity < 0.005 && (w.pluginData.pinyinOpacity || 0) < 0.005) return

      ctx.save()
      ctx.translate(w.currentX, w.currentY)

      const isTyped = w.isActivated && !node.isExiting
      const isCurrent = (i === node.activeWordIndex) && !node.isExiting
      const phase = w.pluginData.charPhase || 0

      // ============================================
      // 绘制拼音 (字的上方)
      // ============================================
      const pinyinOp = w.pluginData.pinyinOpacity || 0
      if (pinyinOp > 0.01 && w.pluginData.pinyin) {
        ctx.save()

        const visibleCount = w.pluginData.visiblePinyinCount || 0
        const fullPinyin = w.pluginData.pinyin as string
        const visibleText = fullPinyin.slice(0, visibleCount)

        // 拼音位置：汉字上方
        const pyY = -node.fontSize * 0.65

        ctx.font = `500 ${pyFontSize}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.globalAlpha = node.opacity * pinyinOp * 0.9

        // 拼音文本框背景 (模拟输入法文本框)
        const pyTextWidth = ctx.measureText(fullPinyin).width
        const boxW = pyTextWidth + 12
        const boxH = pyFontSize + 8
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
        ctx.beginPath()
        ctx.roundRect(-boxW / 2, pyY - boxH / 2, boxW, boxH, 3)
        ctx.fill()

        // 底部小三角 (指向汉字)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
        ctx.beginPath()
        ctx.moveTo(-4, pyY + boxH / 2)
        ctx.lineTo(4, pyY + boxH / 2)
        ctx.lineTo(0, pyY + boxH / 2 + 5)
        ctx.closePath()
        ctx.fill()

        // 逐字母绘制：已显示的字母正常亮度，刚出现的字母有缩放动画
        ctx.textAlign = 'left'
        const startX = -ctx.measureText(visibleText).width / 2

        for (let ci = 0; ci < visibleCount; ci++) {
          const char = fullPinyin[ci]
          const isLatest = (ci === visibleCount - 1) && phase === 1
          const charW = ctx.measureText(fullPinyin.slice(0, ci)).width

          ctx.save()
          ctx.translate(startX + charW, pyY)

          if (isLatest) {
            // 最新一个字母：轻微弹入效果
            const letterAge = (w.pluginData.visiblePinyinCount - ci) < 1.5 ? 0 : 1
            const scale = letterAge < 1 ? 1.3 - 0.3 * letterAge : 1.0
            ctx.scale(scale, scale)
            ctx.fillStyle = '#ffffff'
            ctx.shadowColor = 'rgba(255, 255, 255, 0.4)'
            ctx.shadowBlur = 6
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
            ctx.shadowBlur = 0
          }

          ctx.fillText(char, 0, 0)
          ctx.restore()
        }

        ctx.restore()
      }

      // ============================================
      // 绘制汉字
      // ============================================
      const charScale = w.pluginData.charScale || 1.0

      ctx.save()
      if (charScale !== 1.0) {
        ctx.scale(charScale, charScale)
      }

      ctx.font = `bold ${node.fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = node.opacity * w.opacity

      if (isCurrent && phase >= 2) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
        ctx.shadowBlur = 14
        ctx.fillStyle = '#ffffff'
      } else if (isCurrent && phase === 1) {
        // 拼音输入中：汉字极淡预览
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
      } else if (isTyped) {
        ctx.shadowColor = 'rgba(255, 255, 255, 0.15)'
        ctx.shadowBlur = 4
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      } else {
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      }

      ctx.fillText(w.text, 0, 0)
      ctx.restore()

      ctx.restore()
    })

    // --- 底部进度条 ---
    if (!node.isExiting && node.words.length > 1) {
      const firstWord = node.words[0]
      const lastWord = node.words[node.words.length - 1]
      const lineLeft = firstWord.targetRelX - (firstWord.pluginData.measuredWidth || 0) / 2
      const lineRight = lastWord.targetRelX + (lastWord.pluginData.measuredWidth || 0) / 2
      const lineWidth = lineRight - lineLeft
      const barY = node.fontSize * 0.7

      if (lineWidth > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath()
        ctx.roundRect(lineLeft, barY, lineWidth, 2.5, 1.25)
        ctx.fill()

        const typedEdge = node.pluginData.typedRightEdge || lineLeft
        const progress = Math.max(0, typedEdge - lineLeft)
        if (progress > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
          ctx.shadowColor = 'rgba(255, 255, 255, 0.3)'
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.roundRect(lineLeft, barY, progress, 2.5, 1.25)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
    }

    ctx.restore()
  },

  // ==========================================
  // 绘制层 3：闪烁竖线光标
  // ==========================================
  drawCursor(node: LyricNode, ctx: CanvasRenderingContext2D) {
    if (node.trackOpacity < 0.01 || node.isExiting) return

    ctx.save()
    ctx.translate(node.x, node.y)

    const blinkAlpha = 0.5 + 0.5 * Math.sin(node.pluginData.caretPhase || 0)

    ctx.globalAlpha = node.opacity * node.trackOpacity * blinkAlpha

    const caretH = node.fontSize * 0.9
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
