/**
 * lyricSprites.ts
 * 歌词画布精灵系统：WordSprite（逐字粒子）、LyricNode（行级容器）、PolygonSprite（频谱多边形）
 * 
 * PolygonSprite 是一个底层几何图形工具类，各模式可按需使用，但系统不将其作为高层可复用组件暴露。
 */

import type { LyricRenderMode } from './render/types'

/**
 * 逐字粒子精灵：每个汉字/单词一个实例，仅作为状态容器。
 * 动画细节全权交由 LyricRenderMode 管理。
 */
export class WordSprite {
  text: string
  start: number
  duration: number
  opacity: number = 0

  // 散点定位系统
  targetRelX: number = 0 // 相对于行中心的最终 X
  targetRelY: number = 0 // 相对于行基线的最终 Y
  originX: number = 0    // 组装起点 X
  originY: number = 0    // 组装起点 Y

  currentX: number = 0
  currentY: number = 0

  isActivated: boolean = false
  activatedTime: number = 0
  assemblyDelay: number = 0 // 每个点独立的起步延迟

  // 给渲染模式存储自定义数据的空间
  pluginData: any = {}

  constructor(text: string, start: number, duration: number) {
    this.text = text
    this.start = start
    this.duration = duration
  }
}

/**
 * 行级歌词容器：管理一行歌词中所有 WordSprite 的布局、入场/离场、追踪光标。
 */
export class LyricNode {
  text: string
  words: WordSprite[] = []
  startTime: number
  x: number
  y: number
  opacity: number = 0
  rotation: number = 0
  isExiting: boolean = false
  fontSize: number

  // 追踪光标系统
  trackX: number = 0
  trackY: number = 0
  trackW: number = 0
  trackOpacity: number = 0

  // 渲染模式使用的状态
  elapsed: number = 0
  activeWordIndex: number = -1
  isFirstUpdate: boolean = true

  // 给渲染模式存储自定义数据的空间
  pluginData: any = {}
  mode: LyricRenderMode

  constructor(lineData: any, canvasWidth: number, canvasHeight: number, tempCtx: CanvasRenderingContext2D, mode: LyricRenderMode, initialElapsed: number = 0) {
    this.mode = mode
    this.text = lineData.text
    this.startTime = performance.now() - initialElapsed
    this.fontSize = 42

    // 基础中心点
    this.x = canvasWidth / 2
    this.y = canvasHeight / 2 + (Math.random() - 0.5) * 40

    if (lineData.words && lineData.words.length > 0) {
      this.words = lineData.words.map((w: any) => new WordSprite(w.text, (w.start - lineData.start) * 1000, w.duration * 1000))
    } else {
      this.words = [new WordSprite(this.text, 0, 3000)]
    }

    // 由指定的渲染模式接管初始化
    this.mode.initNode(this, tempCtx)
  }

  update(dt: number, externalWordIndex: number) {
    // 【兼容层】非逐字歌词时 C++ 输出 wordIndex = -1，
    // 此时自动将全部 sprite 标记为已激活，避免整行永远点不亮
    let effectiveIndex = externalWordIndex
    if (externalWordIndex === -1 && this.words.length > 0) {
      this.words.forEach(w => {
        if (!w.isActivated) {
          w.isActivated = true
          w.activatedTime = performance.now()
        }
      })
      effectiveIndex = this.words.length - 1
    }

    this.mode.updateNode(this, dt, effectiveIndex)
  }

  drawLyrics(ctx: CanvasRenderingContext2D) {
    this.mode.drawLyrics(this, ctx)
  }

  drawCursor(ctx: CanvasRenderingContext2D) {
    this.mode.drawCursor(this, ctx)
  }
}

/**
 * 频谱多边形精灵：由节奏检测触发生成，在画布上扩散并消失。
 */
export class PolygonSprite {
  x: number
  y: number
  sides: number
  radius: number
  rotation: number
  rotationSpeed: number
  opacity: number = 0.8
  scale: number = 1.0
  maxScale: number
  thickness: number

  constructor(width: number, height: number, sides: number, energy: number) {
    // 随机分布在中心区域
    const spreadX = width * 0.4
    const spreadY = height * 0.4
    this.x = (width / 2) + (Math.random() - 0.5) * spreadX
    this.y = (height / 2) + (Math.random() - 0.5) * spreadY

    this.sides = sides
    this.radius = 20 + Math.random() * 30 // 基础半径
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.04

    // 缩放比例与触发时的振幅强度挂钩
    this.maxScale = 1.2 + energy * 10

    this.thickness = 2 + Math.random() * 2
  }

  update(dt: number) {
    this.scale += (this.maxScale - this.scale) * 0.05 * dt
    this.opacity -= 0.012 * dt // 降低消失速度，让肉眼能捕捉到节奏点
    this.rotation += this.rotationSpeed * dt
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0) return
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.scale(this.scale, this.scale)
    ctx.globalAlpha = Math.max(0, this.opacity)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = this.thickness / this.scale // 保持视觉宽度一致

    ctx.beginPath()
    for (let i = 0; i < this.sides; i++) {
      const angle = (i * 2 * Math.PI) / this.sides
      const px = this.radius * Math.cos(angle)
      const py = this.radius * Math.sin(angle)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.restore()
  }
}
