import type { LyricRenderMode } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import manifest from './manifest.json'

const ENTRANCE_STYLES = ['BLAST', 'GLIDE_UP', 'ZOOM_IN', 'ROLL_IN']
const EXIT_STYLES = ['SMOKE', 'SHATTER', 'VORTEX', 'FLIP_OUT']

export const DefaultMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,

  initNode(node: LyricNode, tempCtx: CanvasRenderingContext2D) {
    const entranceStyle = ENTRANCE_STYLES[Math.floor(Math.random() * ENTRANCE_STYLES.length)]
    const exitStyle = EXIT_STYLES[Math.floor(Math.random() * EXIT_STYLES.length)]
    
    node.pluginData.entranceStyle = entranceStyle
    node.pluginData.exitStyle = exitStyle

    const range = 150

    if (node.words && node.words.length > 0) {
      tempCtx.font = `bold ${node.fontSize}px sans-serif`
      let totalW = 0
      const wordWidths: number[] = []
      const gaps: number[] = []

      node.words.forEach((w) => {
        const wWidth = tempCtx.measureText(w.text).width
        wordWidths.push(wWidth)
        const gap = 12 + Math.random() * 20
        gaps.push(gap)
        totalW += wWidth + gap
      })
      totalW -= gaps[gaps.length - 1]

      let currentX = -totalW / 2
      node.words.forEach((sprite: WordSprite, i: number) => {
        sprite.targetRelX = currentX + wordWidths[i] / 2
        sprite.targetRelY = (Math.random() - 0.5) * 30
        
        if (entranceStyle === 'BLAST') {
          sprite.originX = sprite.targetRelX * 2
          sprite.originY = sprite.targetRelY * 2
        } else if (entranceStyle === 'GLIDE_UP') {
          sprite.originX = sprite.targetRelX
          sprite.originY = sprite.targetRelY + range
        } else {
          sprite.originX = sprite.targetRelX + (Math.random() - 0.5) * range
          sprite.originY = sprite.targetRelY + (Math.random() - 0.5) * range
        }
        
        sprite.currentX = sprite.originX
        sprite.currentY = sprite.originY
        sprite.assemblyDelay = Math.random() * 200

        currentX += wordWidths[i] + gaps[i]
      })
    } else {
      // 兼容非逐字行
      const sprite = node.words[0]
      sprite.targetRelX = 0
      sprite.targetRelY = 0
      if (entranceStyle === 'BLAST') {
        sprite.originX = sprite.targetRelX * 2
        sprite.originY = sprite.targetRelY * 2
      } else if (entranceStyle === 'GLIDE_UP') {
        sprite.originX = sprite.targetRelX
        sprite.originY = sprite.targetRelY + range
      } else {
        sprite.originX = sprite.targetRelX + (Math.random() - 0.5) * range
        sprite.originY = sprite.targetRelY + (Math.random() - 0.5) * range
      }
      sprite.currentX = sprite.originX
      sprite.currentY = sprite.originY
      sprite.isActivated = true
    }

    if (node.words.length > 0) {
      node.trackX = node.words[0].originX
      node.trackY = node.words[0].originY
      node.trackW = 20
    }
  },

  updateNode(node: LyricNode, dt: number, externalWordIndex: number) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.1

    let currentActiveWord: WordSprite | null = null

    node.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true
      }

      // Word update
      if (!w.isActivated) return
      if (w.activatedTime === 0) w.activatedTime = performance.now()
      const elapsed = performance.now() - w.activatedTime

      if (!node.isExiting) {
        const assemblyElapsed = Math.max(0, elapsed - w.assemblyDelay)
        if (assemblyElapsed > 1500) {
          w.currentX = w.targetRelX
          w.currentY = w.targetRelY
          w.opacity = 1
        } else {
          const factor = 1 - Math.exp(-assemblyElapsed / 450)
          w.currentX = w.originX + (w.targetRelX - w.originX) * factor
          w.currentY = w.originY + (w.targetRelY - w.originY) * factor
          w.opacity = factor
        }
      } else {
        w.opacity *= 0.9
        const exitStyle = node.pluginData.exitStyle
        if (exitStyle === 'SHATTER') {
          w.currentY += 5
          w.currentX += (Math.random() - 0.5) * 4
        } else {
          w.currentX += w.targetRelX * 0.1
          w.currentY += w.targetRelY * 0.1
        }
      }
    })

    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      currentActiveWord = node.words[externalWordIndex]
    }

    if (currentActiveWord) {
      node.trackOpacity += (1 - node.trackOpacity) * 0.1
      if (node.isFirstUpdate) {
        node.trackX = currentActiveWord.currentX
        node.trackY = currentActiveWord.currentY
        node.isFirstUpdate = false
      } else {
        const safeDt = Number.isFinite(dt) ? dt : 1
        node.trackX += (currentActiveWord.currentX - node.trackX) * 0.15 * safeDt
        node.trackY += (currentActiveWord.currentY - node.trackY) * 0.15 * safeDt
      }
    } else {
      node.trackOpacity *= 0.9
      node.isFirstUpdate = false
    }
  },

  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.rotate(node.rotation)
    ctx.globalAlpha = Math.max(0, node.opacity)

    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)'
    ctx.shadowBlur = 12
    ctx.font = `bold ${node.fontSize}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'

    node.words.forEach((w) => {
      if (!w.isActivated && w.opacity < 0.01) return
      ctx.save()
      ctx.translate(w.currentX, w.currentY)
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
    ctx.rotate(node.rotation)

    let activeW = 0
    const activeWord = node.activeWordIndex >= 0 && node.activeWordIndex < node.words.length
      ? node.words[node.activeWordIndex] : null
    
    if (activeWord) {
      // 临时测量当前激活字宽
      ctx.font = `bold ${node.fontSize}px sans-serif`
      activeW = ctx.measureText(activeWord.text).width + 16
      node.trackW += (activeW - node.trackW) * 0.2
    }

    ctx.save()
    ctx.translate(node.trackX, node.trackY)
    ctx.globalAlpha = node.opacity * node.trackOpacity * 0.35
    ctx.fillStyle = '#fff'

    ctx.shadowBlur = 10
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)'

    const height = node.fontSize * 1.1
    ctx.beginPath()
    ctx.roundRect(-node.trackW / 2, -height / 1.5, node.trackW, height, 4)
    ctx.fill()
    ctx.restore()
    ctx.restore()
  }
}
