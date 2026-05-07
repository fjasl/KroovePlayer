import type { LyricRenderMode } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import { pinyin } from 'pinyin-pro'
import manifest from './manifest.json'

// 常用字池 (生成假候选用)
const POOL = '的一是不了在人有这中大来上为国地到以说时要就出会也把好过能对着下自之年后作里用去行十二三四五六七八九百千万日月风雨花草山水天春夏秋冬东南西北红蓝白黑金银高长开门心手口目耳足石火土木'

function isCJK(ch: string): boolean {
  const c = ch.codePointAt(0) || 0
  return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)
}

function getWordPinyin(text: string): string {
  const hasCJK = [...text].some(isCJK)
  if (!hasCJK) return ''
  return pinyin(text, { toneType: 'none', type: 'string' }).replace(/\s+/g, '')
}

// 预计算字池拼音
const POOL_DATA = POOL.split('').map(char => ({
  char,
  py: getWordPinyin(char)
})).filter(item => item.py.length > 0)

function getDynamicCandidates(real: string, prefix: string, count: number): string[] {
  const result = [real]
  if (!prefix) return result

  const matches = POOL_DATA.filter(item => item.py.startsWith(prefix) && item.char !== real)
  const fallbacks = POOL_DATA.filter(item => item.char !== real)

  const shuffle = (arr: any[]) => [...arr].sort(() => Math.random() - 0.5)
  const shuffledMatches = shuffle(matches)
  const shuffledFallbacks = shuffle(fallbacks)

  while (result.length < count) {
    if (shuffledMatches.length > 0) {
      result.push(shuffledMatches.pop()!.char)
    } else if (shuffledFallbacks.length > 0) {
      const fallback = shuffledFallbacks.pop()!.char
      if (!result.includes(fallback)) {
        result.push(fallback)
      }
    } else {
      break
    }
  }
  return result
}

export const TypewriterMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,

  initNode(node: LyricNode, tempCtx: CanvasRenderingContext2D) {
    node.fontSize = 40
    node.y = node.x > 0 ? (node.y * 0.3 + (tempCtx.canvas.height / 2) * 0.7) : node.y

    const GAP = 6

    if (node.words && node.words.length > 0) {
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
      node.words.forEach((s: WordSprite, i: number) => {
        s.targetRelX = cx + widths[i] / 2
        s.targetRelY = 0
        s.originX = s.targetRelX
        s.originY = 0
        s.currentX = s.targetRelX
        s.currentY = 0
        s.opacity = 0
        s.assemblyDelay = 0
        s.pluginData.measuredWidth = widths[i]

        const py = getWordPinyin(s.text)
        s.pluginData.pinyin = py
        s.pluginData.pinyinLen = py.length
        s.pluginData.hasPinyin = py.length > 0
        s.pluginData.candidates = py.length > 0 ? getDynamicCandidates(s.text, py[0] || '', 5) : [s.text]
        s.pluginData.charScale = 1.0
        s.pluginData.pinyinOpacity = 0
        s.pluginData.candidateOpacity = 0
        s.pluginData.visiblePinyinCount = 0
        s.pluginData.charPhase = 0 // 0=wait 1=pinyin 2=confirm 3=done

        cx += widths[i] + GAP
      })
    } else {
      const s = node.words[0]
      s.targetRelX = 0; s.targetRelY = 0; s.originX = 0; s.originY = 0
      s.currentX = 0; s.currentY = 0; s.isActivated = true
      s.pluginData.measuredWidth = tempCtx.measureText(s.text).width
      s.pluginData.pinyin = ''; s.pluginData.pinyinLen = 0
      s.pluginData.hasPinyin = false; s.pluginData.candidates = [s.text]
      s.pluginData.charScale = 1.0; s.pluginData.pinyinOpacity = 0
      s.pluginData.candidateOpacity = 0; s.pluginData.charPhase = 3
    }

    node.pluginData.caretPhase = 0
    node.pluginData.typedRightEdge = 0

    if (node.words.length > 0) {
      const f = node.words[0]
      node.trackX = f.targetRelX - (f.pluginData.measuredWidth || 20) / 2 - 2
      node.trackY = 0; node.trackW = 2.5; node.trackOpacity = 0
    }
  },

  updateNode(node: LyricNode, dt: number, externalWordIndex: number) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.12
    const safeDt = Number.isFinite(dt) ? dt : 1

    node.pluginData.caretPhase = (node.pluginData.caretPhase || 0) + safeDt * 0.08
    if (node.pluginData.caretPhase > Math.PI * 2) node.pluginData.caretPhase -= Math.PI * 2

    const PY_RATIO = 0.6

    node.words.forEach((w, i) => {
      if (!node.isExiting) {
        if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
          w.isActivated = true
          w.activatedTime = performance.now()
          w.pluginData.charPhase = w.pluginData.hasPinyin ? 1 : 2
        }
        if (!w.isActivated) return

        const elapsed = performance.now() - w.activatedTime
        const totalDur = Math.max(w.duration, 300)
        const pyDur = totalDur * PY_RATIO
        const confirmDur = totalDur * (1 - PY_RATIO)

        if (w.pluginData.hasPinyin && w.pluginData.charPhase === 1) {
          // --- 拼音输入阶段 ---
          const prog = Math.min(1, elapsed / pyDur)
          const newVisibleCount = Math.ceil(prog * w.pluginData.pinyinLen)
          
          if (w.pluginData.visiblePinyinCount !== newVisibleCount) {
            w.pluginData.visiblePinyinCount = newVisibleCount
            const prefix = (w.pluginData.pinyin as string).slice(0, newVisibleCount)
            w.pluginData.candidates = getDynamicCandidates(w.text, prefix, 5)
          }

          w.pluginData.pinyinOpacity = Math.min(1, prog * 2.5)
          w.pluginData.candidateOpacity = Math.min(1, prog * 2)
          w.opacity = 0 // 字完全不显示，由拼音替代
          w.pluginData.charScale = 1.2

          if (elapsed >= pyDur) {
            w.pluginData.charPhase = 2
            w.pluginData.confirmStartTime = performance.now()
          }
        } else if (w.pluginData.charPhase === 2) {
          // --- 选字确认阶段 ---
          const cElapsed = w.pluginData.hasPinyin
            ? performance.now() - (w.pluginData.confirmStartTime || performance.now())
            : elapsed
          const t = Math.min(1, cElapsed / Math.max(confirmDur, 150))
          const ease = 1 - Math.pow(1 - t, 3)

          w.pluginData.pinyinOpacity = Math.max(0, 1 - ease * 3)
          w.pluginData.candidateOpacity = Math.max(0, 1 - ease * 2.5)
          w.pluginData.visiblePinyinCount = w.pluginData.pinyinLen
          w.pluginData.charScale = 1.2 - 0.2 * ease
          w.opacity = ease

          // 微弹
          if (t > 0.5 && t < 1) {
            w.pluginData.charScale -= Math.sin((t - 0.5) * Math.PI / 0.5) * 0.03
          }

          if (t >= 1) {
            w.pluginData.charPhase = 3
            w.opacity = 1; w.pluginData.charScale = 1.0
            w.pluginData.pinyinOpacity = 0; w.pluginData.candidateOpacity = 0
          }
        } else if (w.pluginData.charPhase === 3) {
          w.opacity = 1; w.pluginData.charScale = 1.0
          w.pluginData.pinyinOpacity = 0; w.pluginData.candidateOpacity = 0
        }

        w.currentX = w.targetRelX; w.currentY = w.targetRelY
      } else {
        w.opacity *= (0.93 - i * 0.003)
        w.currentY -= 1.8 * safeDt
        w.currentX += (Math.random() - 0.5) * 0.8 * safeDt
        w.pluginData.pinyinOpacity = 0; w.pluginData.candidateOpacity = 0
      }
    })

    // 光标追踪
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const aw = node.words[externalWordIndex]
      const halfW = (aw.pluginData.measuredWidth || 20) / 2
      const tx = aw.targetRelX + halfW + 3
      const ty = aw.targetRelY
      node.trackOpacity += (1 - node.trackOpacity) * 0.15
      if (node.isFirstUpdate) {
        node.trackX = tx; node.trackY = ty; node.isFirstUpdate = false
      } else {
        node.trackX += (tx - node.trackX) * 0.25 * safeDt
        node.trackY += (ty - node.trackY) * 0.25 * safeDt
      }
      node.pluginData.typedRightEdge = aw.targetRelX + halfW
    } else if (node.isExiting) {
      node.trackOpacity *= 0.88
    } else {
      node.isFirstUpdate = false
    }
  },

  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.globalAlpha = Math.max(0, node.opacity)

    node.words.forEach((w, i) => {
      const phase = w.pluginData.charPhase || 0
      const pyOp = w.pluginData.pinyinOpacity || 0
      const candOp = w.pluginData.candidateOpacity || 0

      if (w.opacity < 0.005 && pyOp < 0.005) return

      ctx.save()
      ctx.translate(w.currentX, w.currentY)

      // ====== 拼音 (在字的位置) ======
      if (pyOp > 0.01 && w.pluginData.pinyin) {
        ctx.save()
        const pyFont = node.fontSize * 0.55
        ctx.font = `500 ${pyFont}px "Consolas", "Monaco", monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.globalAlpha = node.opacity * pyOp

        const full: string = w.pluginData.pinyin
        const visible = full.slice(0, w.pluginData.visiblePinyinCount || 0)

        // 拼音底部横线 (模拟 IME 输入下划线)
        const pyW = ctx.measureText(full).width
        const visW = ctx.measureText(visible).width
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(-pyW / 2, pyFont * 0.45)
        ctx.lineTo(pyW / 2, pyFont * 0.45)
        ctx.stroke()

        // 逐字母绘制
        ctx.textAlign = 'left'
        const startX = -visW / 2
        for (let ci = 0; ci < (w.pluginData.visiblePinyinCount || 0); ci++) {
          const prefix = visible.slice(0, ci)
          const charX = startX + ctx.measureText(prefix).width
          const isLatest = ci === (w.pluginData.visiblePinyinCount || 0) - 1 && phase === 1

          ctx.save()
          ctx.translate(charX, 0)
          if (isLatest) {
            ctx.fillStyle = '#ffffff'
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
            ctx.shadowBlur = 8
          } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
            ctx.shadowBlur = 0
          }
          ctx.fillText(full[ci], 0, 0)
          ctx.restore()
        }
        ctx.restore()
      }

      // ====== 候选框 (字的下方) ======
      if (candOp > 0.01 && w.pluginData.candidates && w.pluginData.candidates.length > 1) {
        ctx.save()
        ctx.globalAlpha = node.opacity * candOp

        const candFont = 16 // 稍微大一点
        ctx.font = `500 ${candFont}px sans-serif`
        ctx.textBaseline = 'middle'

        const cands: string[] = w.pluginData.candidates
        const pad = 12 // 增加内边距
        const itemGap = 16
        const labels = cands.map((c: string, ci: number) => `${ci + 1}. ${c}`)
        const labelWidths = labels.map((l: string) => ctx.measureText(l).width)
        const boxW = labelWidths.reduce((s: number, lw: number) => s + lw, 0) + itemGap * (labels.length - 1) + pad * 2
        const boxH = candFont + pad * 2
        const boxY = node.fontSize * 0.55 + 12 // 稍微往下移一点

        // 阴影
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
        ctx.shadowBlur = 12
        ctx.shadowOffsetY = 4

        // 背景 (明亮风格, 磨砂玻璃质感模拟)
        ctx.fillStyle = 'rgba(245, 245, 247, 0.95)'
        ctx.beginPath()
        ctx.roundRect(-boxW / 2, boxY, boxW, boxH, 8)
        ctx.fill()

        ctx.shadowBlur = 0
        ctx.shadowOffsetY = 0

        // 边框 (非常淡的灰色)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(-boxW / 2, boxY, boxW, boxH, 8)
        ctx.stroke()

        // 候选项
        ctx.textAlign = 'left'
        let lx = -boxW / 2 + pad
        labels.forEach((label: string, li: number) => {
          if (li === 0) {
            // #1 高亮背景 (圆角矩形, 柔和的品牌蓝)
            const hlW = labelWidths[li] + 12
            ctx.fillStyle = 'rgba(0, 120, 212, 0.15)'
            ctx.beginPath()
            ctx.roundRect(lx - 6, boxY + 4, hlW, boxH - 8, 6)
            ctx.fill()
            
            // #1 文字颜色
            ctx.fillStyle = 'rgba(0, 120, 212, 0.9)'
          } else {
            // 其他候选项文字颜色 (深灰)
            ctx.fillStyle = 'rgba(60, 60, 64, 0.8)'
          }
          ctx.fillText(label, lx, boxY + boxH / 2)
          lx += labelWidths[li] + itemGap
        })

        ctx.restore()
      }

      // ====== 汉字 ======
      if (w.opacity > 0.005) {
        const scale = w.pluginData.charScale || 1.0
        ctx.save()
        if (scale !== 1.0) ctx.scale(scale, scale)

        ctx.font = `bold ${node.fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.globalAlpha = node.opacity * w.opacity

        const isCurrent = i === node.activeWordIndex && !node.isExiting
        const isTyped = w.isActivated && !node.isExiting

        if (isCurrent && phase >= 2) {
          ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'
          ctx.shadowBlur = 14
          ctx.fillStyle = '#ffffff'
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
      }

      ctx.restore()
    })

    // --- 底部进度条 ---
    if (!node.isExiting && node.words.length > 1) {
      const fw = node.words[0], lw = node.words[node.words.length - 1]
      const ll = fw.targetRelX - (fw.pluginData.measuredWidth || 0) / 2
      const lr = lw.targetRelX + (lw.pluginData.measuredWidth || 0) / 2
      const lWidth = lr - ll
      const barY = node.fontSize * 0.7

      if (lWidth > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.beginPath(); ctx.roundRect(ll, barY, lWidth, 2.5, 1.25); ctx.fill()

        const te = node.pluginData.typedRightEdge || ll
        const prog = Math.max(0, te - ll)
        if (prog > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
          ctx.shadowColor = 'rgba(255, 255, 255, 0.3)'; ctx.shadowBlur = 6
          ctx.beginPath(); ctx.roundRect(ll, barY, prog, 2.5, 1.25); ctx.fill()
          ctx.shadowBlur = 0
        }
      }
    }

    ctx.restore()
  },

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
    ctx.roundRect(node.trackX - caretW / 2, node.trackY - caretH / 2, caretW, caretH, 1.25)
    ctx.fill()

    ctx.restore()
  }
}
