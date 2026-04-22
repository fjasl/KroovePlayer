/**
 * lyricSprites.ts
 * 歌词画布精灵系统：WordSprite（逐字粒子）、LyricNode（行级容器）、PolygonSprite（频谱多边形）
 */

// 动画风格枚举
export type EntranceStyle = 'BLAST' | 'GLIDE_UP' | 'ZOOM_IN' | 'ROLL_IN'
export type ExitStyle = 'SMOKE' | 'SHATTER' | 'VORTEX' | 'FLIP_OUT'

const ENTRANCE_STYLES: EntranceStyle[] = ['BLAST', 'GLIDE_UP', 'ZOOM_IN', 'ROLL_IN']
const EXIT_STYLES: ExitStyle[] = ['SMOKE', 'SHATTER', 'VORTEX', 'FLIP_OUT']

/**
 * 逐字粒子精灵：每个汉字/单词一个实例，负责入场组装动画和离场溃散动画。
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

  constructor(text: string, start: number, duration: number) {
    this.text = text
    this.start = start
    this.duration = duration
  }

  // 初始化组装起点（根据风格决定从哪里飞过来）
  initOrigin(style: EntranceStyle) {
    const range = 150
    if (style === 'BLAST') {
      this.originX = this.targetRelX * 2
      this.originY = this.targetRelY * 2
    } else if (style === 'GLIDE_UP') {
      this.originX = this.targetRelX
      this.originY = this.targetRelY + range
    } else {
      this.originX = this.targetRelX + (Math.random() - 0.5) * range
      this.originY = this.targetRelY + (Math.random() - 0.5) * range
    }
    this.currentX = this.originX
    this.currentY = this.originY
  }

  update(dt: number, isExiting: boolean, exitStyle: ExitStyle) {
    if (!this.isActivated) return
    if (this.activatedTime === 0) this.activatedTime = performance.now()
    const elapsed = performance.now() - this.activatedTime

    if (!isExiting) {
      // 组放过程：带 Stagger 延迟的指数衰减
      const assemblyElapsed = Math.max(0, elapsed - this.assemblyDelay)

      // 如果该词早就该入场了（差距超过 500ms），直接跳过动画进入锁定位置
      if (assemblyElapsed > 500) {
        this.currentX = this.targetRelX
        this.currentY = this.targetRelY
        this.opacity = 1
      } else {
        const factor = 1 - Math.exp(-assemblyElapsed / 450)
        this.currentX = this.originX + (this.targetRelX - this.originX) * factor
        this.currentY = this.originY + (this.targetRelY - this.originY) * factor
        this.opacity = factor
      }
    } else {
      // 溃散过程
      this.opacity *= 0.9
      if (exitStyle === 'SHATTER') {
        this.currentY += 5
        this.currentX += (Math.random() - 0.5) * 4
      } else {
        this.currentX += (this.targetRelX) * 0.1
        this.currentY += (this.targetRelY) * 0.1
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, baseOpacity: number) {
    if (!this.isActivated && this.opacity < 0.01) return
    ctx.save()
    ctx.translate(this.currentX, this.currentY)
    ctx.globalAlpha = baseOpacity * this.opacity
    ctx.fillText(this.text, 0, 0)
    ctx.restore()
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

  entranceStyle: EntranceStyle
  exitStyle: ExitStyle
  elapsed: number = 0
  isFirstUpdate: boolean = true
  activeWordIndex: number = -1 // 由后端 wordIndex 驱动，直接定位当前活动词

  constructor(lineData: any, canvasWidth: number, canvasHeight: number, tempCtx: CanvasRenderingContext2D, initialElapsed: number = 0) {
    this.text = lineData.text
    this.startTime = performance.now() - initialElapsed
    this.fontSize = 42

    // 基础中心点
    this.x = canvasWidth / 2
    this.y = canvasHeight / 2 + (Math.random() - 0.5) * 40

    // 随机风格
    this.entranceStyle = ENTRANCE_STYLES[Math.floor(Math.random() * ENTRANCE_STYLES.length)]
    this.exitStyle = EXIT_STYLES[Math.floor(Math.random() * EXIT_STYLES.length)]

    // 散点布局算法
    if (lineData.words && lineData.words.length > 0) {
      tempCtx.font = `bold ${this.fontSize}px sans-serif`

      let totalW = 0
      const wordWidths: number[] = []
      const gaps: number[] = []

      // 1. 预计算总宽度和随机间距
      lineData.words.forEach((w: any) => {
        const wWidth = tempCtx.measureText(w.text).width
        wordWidths.push(wWidth)
        const gap = 12 + Math.random() * 20 // 散乱间距
        gaps.push(gap)
        totalW += wWidth + gap
      })
      totalW -= gaps[gaps.length - 1]

      // 2. 赋予每个词独立的散点坐标
      let currentX = -totalW / 2
      this.words = lineData.words.map((w: any, i: number) => {
        const sprite = new WordSprite(w.text, (w.start - lineData.start) * 1000, w.duration * 1000)
        sprite.targetRelX = currentX + wordWidths[i] / 2
        sprite.targetRelY = (Math.random() - 0.5) * 30 // 随机基线错位
        sprite.initOrigin(this.entranceStyle)
        sprite.assemblyDelay = Math.random() * 200 // 0~200ms 的随机起跳延迟
        currentX += wordWidths[i] + gaps[i]
        return sprite
      })
    } else {
      // 兼容非逐字行
      const sprite = new WordSprite(this.text, 0, 3000)
      sprite.targetRelX = 0
      sprite.targetRelY = 0
      sprite.initOrigin(this.entranceStyle)
      sprite.isActivated = true
      this.words = [sprite]
    }

    // 初始化光标位置到第一个词，避免突发跳变
    if (this.words.length > 0) {
      this.trackX = this.words[0].originX
      this.trackY = this.words[0].originY
      this.trackW = 20
    }
  }

  // externalWordIndex: 后端实时推送的当前字索引（-1 表示无活动字或非逐字行）
  update(dt: number, externalWordIndex: number) {
    this.elapsed = performance.now() - this.startTime
    this.activeWordIndex = externalWordIndex

    // 基础透明度渐入
    this.opacity += (1 - this.opacity) * 0.1

    // 用后端 wordIndex 驱动词语激活：激活所有 index <= externalWordIndex 的词
    let currentActiveWord: WordSprite | null = null
    this.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true
      }
      w.update(dt, this.isExiting, this.exitStyle)
    })

    // 直接用后端 wordIndex 定位光标追踪目标，无需本地时钟估算
    if (!this.isExiting && externalWordIndex >= 0 && externalWordIndex < this.words.length) {
      currentActiveWord = this.words[externalWordIndex]
    }

    if (currentActiveWord) {
      this.trackOpacity += (1 - this.trackOpacity) * 0.1

      // 如果该行是中途切入的第一帧，光标直接"瞬移"到对应词，不要滑行
      if (this.isFirstUpdate) {
        this.trackX = currentActiveWord.currentX
        this.trackY = currentActiveWord.currentY
        this.isFirstUpdate = false
      } else {
        // 增加安全检查，防止 dt 异常
        const safeDt = Number.isFinite(dt) ? dt : 1
        this.trackX += (currentActiveWord.currentX - this.trackX) * 0.15 * safeDt
        this.trackY += (currentActiveWord.currentY - this.trackY) * 0.15 * safeDt
      }
    } else {
      this.trackOpacity *= 0.9
      this.isFirstUpdate = false
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = Math.max(0, this.opacity)

    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)'
    ctx.shadowBlur = 12
    ctx.font = `bold ${this.fontSize}px sans-serif`
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'

    // A. 绘制追踪光标 (在文字下方)
    if (this.trackOpacity > 0.01) {
      let activeW = 0
      // 直接使用后端驱动的 activeWordIndex
      const activeWord = this.activeWordIndex >= 0 && this.activeWordIndex < this.words.length
        ? this.words[this.activeWordIndex] : null
      if (activeWord) {
        activeW = ctx.measureText(activeWord.text).width + 16
        // 平滑宽度变化
        this.trackW += (activeW - this.trackW) * 0.2
      }

      ctx.save()
      ctx.translate(this.trackX, this.trackY)
      ctx.globalAlpha = this.opacity * this.trackOpacity * 0.35
      ctx.fillStyle = '#fff'

      // 添加类似终端光标的微弱光晕
      ctx.shadowBlur = 10
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)'

      const height = this.fontSize * 1.1
      ctx.beginPath()
      ctx.roundRect(-this.trackW / 2, -height / 1.5, this.trackW, height, 4)
      ctx.fill()
      ctx.restore()
    }

    // B. 委派给每个词自己的绘制逻辑
    this.words.forEach(w => w.draw(ctx, this.opacity))

    ctx.restore()
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
