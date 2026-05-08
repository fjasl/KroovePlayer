import type { LyricRenderMode } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import { pinyin } from 'pinyin-pro'
import manifest from './manifest.json'

function isCJK(ch: string): boolean {
  const c = ch.codePointAt(0) || 0
  return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)
}

function getWordSpelling(text: string): string {
  const hasCJK = [...text].some(isCJK)
  if (hasCJK) {
    // CJK 汉字：返回拼音作为拼写内容
    return pinyin(text, { toneType: 'none', type: 'string' }).replace(/\s+/g, '')
  }
  // 非 CJK（英文等）：返回小写文本本身作为逐字母拼写内容
  return text.toLowerCase().replace(/\s+/g, '')
}

// ========== 随机分块：CJK 歌词切成 1~3 字的拼写块，英文每个词独立 ==========
function randomChunkWords(words: WordSprite[]): { startIdx: number; endIdx: number }[] {
  const blocks: { startIdx: number; endIdx: number }[] = []
  let i = 0
  while (i < words.length) {
    // 检测当前 word 是否包含 CJK 字符
    const hasCJK = [...words[i].text].some(ch => {
      const c = ch.codePointAt(0) || 0
      return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)
    })

    if (!hasCJK) {
      // 英文/非 CJK：每个词独立为一个 block，不再合并
      blocks.push({ startIdx: i, endIdx: i + 1 })
      i += 1
    } else {
      // CJK：保持随机 1~3 字分块
      const remaining = words.length - i
      const maxSize = Math.min(3, remaining)
      const size = remaining === 1 ? 1 : Math.floor(Math.random() * maxSize) + 1
      blocks.push({ startIdx: i, endIdx: i + size })
      i += size
    }
  }
  return blocks
}

// ========== 拼音块数据结构 ==========
interface PinyinBlock {
  startIdx: number
  endIdx: number
  pinyin: string
  pinyinLen: number
  visiblePinyinCount: number
  charPhase: number // 0=wait 1=pinyin 2=confirm 3=done
  activatedTime: number
  confirmStartTime: number
  pinyinOpacity: number
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
        s.isActivated = false
        s.assemblyDelay = 0
        s.pluginData.measuredWidth = widths[i]
        cx += widths[i] + GAP
      })

      // ====== 随机分块，建立拼音块 ======
      const chunks = randomChunkWords(node.words)
      const blocks: PinyinBlock[] = chunks.map(chunk => {
        const py = node.words.slice(chunk.startIdx, chunk.endIdx)
          .map(w => getWordSpelling(w.text))
          .join('')
        return {
          startIdx: chunk.startIdx,
          endIdx: chunk.endIdx,
          pinyin: py,
          pinyinLen: py.length,
          visiblePinyinCount: 0,
          charPhase: 0,
          activatedTime: 0,
          confirmStartTime: 0,
          pinyinOpacity: 0,
        }
      })

      node.pluginData.blocks = blocks
      // 记录每个字属于哪个 block
      node.words.forEach((w, i) => {
        const blockIdx = blocks.findIndex(b => i >= b.startIdx && i < b.endIdx)
        w.pluginData.blockIndex = blockIdx
      })
    } else {
      const s = node.words[0]
      s.targetRelX = 0; s.targetRelY = 0; s.originX = 0; s.originY = 0
      s.currentX = 0; s.currentY = 0; s.isActivated = true
      s.pluginData.measuredWidth = tempCtx.measureText(s.text).width
      s.pluginData.blockIndex = -1
    }

    node.pluginData.caretPhase = 0
    node.pluginData.typedRightEdge = 0

    // 预计算拼音等宽字符宽度，供 updateNode 精确追踪光标
    tempCtx.font = `500 ${node.fontSize * 0.55}px "Consolas", "Monaco", monospace`
    node.pluginData.pyCharWidth = tempCtx.measureText('a').width

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

    const blocks: PinyinBlock[] = node.pluginData.blocks || []
    const PY_RATIO = 0.6

    // ====== 1. 更新每个 Block 的状态机（基于歌词时间轴驱动） ======
    blocks.forEach(block => {
      // Block 的时间范围：取块内第一个字的 start 和最后一个字的 (start + duration)
      const firstWord = node.words[block.startIdx]
      const lastWord = node.words[block.endIdx - 1]
      const blockStartMs = firstWord.start
      const blockEndMs = lastWord.start + lastWord.duration

      const elapsed = node.elapsed // 当前行已经播放了多少毫秒

      if (elapsed >= blockEndMs) {
        // 这个 block 的时间已经完全过去：直接 phase 3，字瞬间显示
        if (block.charPhase !== 3) {
          block.charPhase = 3
          block.pinyinOpacity = 0
          block.visiblePinyinCount = block.pinyinLen
          for (let i = block.startIdx; i < block.endIdx; i++) {
            node.words[i].isActivated = true
          }
        }
      } else if (elapsed >= blockStartMs) {
        // 正在这个 block 的时间范围内
        const blockElapsed = elapsed - blockStartMs // 这个 block 已经播放了多久

        // 块的总持续时间 = 块内字数 × 单字平均时长（向后兼容）
        const wordCount = block.endIdx - block.startIdx
        const totalDur = Math.max(
          node.words.slice(block.startIdx, block.endIdx).reduce((s, w) => s + Math.max(w.duration, 300), 0),
          wordCount * 300
        )
        const pyDur = totalDur * PY_RATIO
        const confirmDur = totalDur * (1 - PY_RATIO)

        if (block.charPhase === 0) {
          block.charPhase = block.pinyinLen > 0 ? 1 : 2
        }

        if (block.charPhase === 1) {
          // --- 拼音输入阶段（整个块一起） ---
          const prog = Math.min(1, blockElapsed / pyDur)
          block.visiblePinyinCount = Math.ceil(prog * block.pinyinLen)
          block.pinyinOpacity = Math.min(1, prog * 2.5)

          if (blockElapsed >= pyDur) {
            block.charPhase = 2
          }
        } else if (block.charPhase === 2) {
          // --- 确认阶段（整个块一起淡入） ---
          const cElapsed = blockElapsed - pyDur
          const t = Math.min(1, Math.max(0, cElapsed) / Math.max(confirmDur, 150))

          block.pinyinOpacity = Math.max(0, 1 - (1 - Math.pow(1 - t, 3)) * 3)
          block.visiblePinyinCount = block.pinyinLen

          if (t >= 1) {
            block.charPhase = 3
            block.pinyinOpacity = 0
            for (let i = block.startIdx; i < block.endIdx; i++) {
              node.words[i].isActivated = true
            }
          }
        }
      } else {
        // 还没到这个 block
        block.charPhase = 0
      }
    })

    // ====== 2. 根据所属 Block 更新每个字的状态 ======
    node.words.forEach((w, i) => {
      if (node.isExiting) {
        w.opacity *= (0.93 - i * 0.003)
        w.currentY -= 1.8 * safeDt
        w.currentX += (Math.random() - 0.5) * 0.8 * safeDt
        w.pluginData.pinyinOpacity = 0
        w.pluginData.charScale = 1.0
        return
      }

      const bIdx = w.pluginData.blockIndex
      if (bIdx === undefined || bIdx === -1) {
        w.currentX = w.targetRelX; w.currentY = w.targetRelY
        return
      }

      const block = blocks[bIdx]

      if (block.charPhase === 0) {
        w.opacity = 0
        w.pluginData.pinyinOpacity = 0
        w.pluginData.charScale = 1.0
      } else if (block.charPhase === 1) {
        w.opacity = 0
        w.pluginData.pinyinOpacity = block.pinyinOpacity
        w.pluginData.charScale = 1.2
      } else if (block.charPhase === 2) {
        // 确认阶段：字淡入
        const firstWord = node.words[block.startIdx]
        const lastWord = node.words[block.endIdx - 1]
        const totalDur = Math.max(
          node.words.slice(block.startIdx, block.endIdx).reduce((s, w2) => s + Math.max(w2.duration, 300), 0),
          (block.endIdx - block.startIdx) * 300
        )
        const confirmDur = totalDur * (1 - PY_RATIO)
        const blockElapsed = node.elapsed - firstWord.start
        const cElapsed = blockElapsed - totalDur * PY_RATIO
        const t = Math.min(1, Math.max(0, cElapsed) / Math.max(confirmDur, 150))
        const ease = 1 - Math.pow(1 - t, 3)

        w.pluginData.pinyinOpacity = block.pinyinOpacity
        w.pluginData.charScale = 1.2 - 0.2 * ease
        w.opacity = ease

        if (t > 0.5 && t < 1) {
          w.pluginData.charScale -= Math.sin((t - 0.5) * Math.PI / 0.5) * 0.03
        }
      } else if (block.charPhase === 3) {
        w.opacity = 1
        w.pluginData.charScale = 1.0
        w.pluginData.pinyinOpacity = 0
      }

      w.currentX = w.targetRelX
      w.currentY = w.targetRelY
    })

    // ====== 光标追踪 ======
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const aw = node.words[externalWordIndex]
      const bIdx = aw.pluginData.blockIndex
      let tx: number
      let ty: number
      let halfW: number

      if (bIdx !== undefined && bIdx !== -1) {
        const block = blocks[bIdx]
        if (block.charPhase === 1) {
          // 拼音输入阶段：光标追踪已输入拼音的末尾
          const firstW = node.words[block.startIdx]
          const lastW = node.words[block.endIdx - 1]
          const blockCenterX = (firstW.targetRelX + lastW.targetRelX) / 2
          const pyCharW = node.pluginData.pyCharWidth || node.fontSize * 0.33
          const visiblePyW = block.visiblePinyinCount * pyCharW
          tx = blockCenterX + visiblePyW / 2 + 2
          ty = firstW.targetRelY
          const lw = node.words[block.endIdx - 1]
          halfW = (lw.pluginData.measuredWidth || 20) / 2
          node.pluginData.typedRightEdge = lw.targetRelX + halfW
        } else {
          // phase 2（确认淡入）或 phase 3（已完成）：光标固定在整个 block 最后一个字的右边缘
          // 避免从 block 内第一个字开始慢慢往后移动的跳变感
          const lw = node.words[block.endIdx - 1]
          halfW = (lw.pluginData.measuredWidth || 20) / 2
          tx = lw.targetRelX + halfW + 3
          ty = lw.targetRelY
          node.pluginData.typedRightEdge = lw.targetRelX + halfW
        }
      } else {
        halfW = (aw.pluginData.measuredWidth || 20) / 2
        tx = aw.targetRelX + halfW + 3
        ty = aw.targetRelY
        node.pluginData.typedRightEdge = aw.targetRelX + halfW
      }

      node.trackOpacity += (1 - node.trackOpacity) * 0.15
      if (node.isFirstUpdate) {
        node.trackX = tx; node.trackY = ty; node.isFirstUpdate = false
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

  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.globalAlpha = Math.max(0, node.opacity)

    const blocks: PinyinBlock[] = node.pluginData.blocks || []

    // ====== 按 Block 绘制拼音（整块拼音显示在块的上方居中） ======
    blocks.forEach(block => {
      if (block.charPhase === 0) return
      const pyOp = block.pinyinOpacity
      if (pyOp < 0.01) return

      // 计算块的中心位置和总宽度
      const firstW = node.words[block.startIdx]
      const lastW = node.words[block.endIdx - 1]
      const blockLeft = firstW.targetRelX - (firstW.pluginData.measuredWidth || 20) / 2
      const blockRight = lastW.targetRelX + (lastW.pluginData.measuredWidth || 20) / 2
      const blockCenterX = (blockLeft + blockRight) / 2
      const blockY = firstW.targetRelY

      ctx.save()
      ctx.translate(blockCenterX, blockY)
      const pyFont = node.fontSize * 0.55
      ctx.font = `500 ${pyFont}px "Consolas", "Monaco", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = node.opacity * pyOp

      const full = block.pinyin
      const visible = full.slice(0, block.visiblePinyinCount)

      // 拼音底部横线
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
      for (let ci = 0; ci < block.visiblePinyinCount; ci++) {
        const prefix = visible.slice(0, ci)
        const charX = startX + ctx.measureText(prefix).width
        const isLatest = ci === block.visiblePinyinCount - 1 && block.charPhase === 1

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
    })

    // ====== 绘制汉字 ======
    node.words.forEach((w, i) => {
      if (w.opacity < 0.005) return

      ctx.save()
      ctx.translate(w.currentX, w.currentY)

      const scale = w.pluginData.charScale || 1.0
      if (scale !== 1.0) ctx.scale(scale, scale)

      ctx.font = `bold ${node.fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = node.opacity * w.opacity

      const isCurrent = i === node.activeWordIndex && !node.isExiting
      const isTyped = w.isActivated && !node.isExiting

      if (isCurrent) {
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
