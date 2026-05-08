import type { LyricNode, WordSprite } from '../lyricSprites'

/** 渲染模式的纯元数据（可被序列化为 JSON，后端可读取） */
export interface LyricModeManifest {
  id: string
  name: string
  description?: string
  author?: string
  version?: string
}

/**
 * 背景渲染器接口：每个模式自行实现其背景/频谱效果。
 * 
 * 注意：系统不提供现成的高层可复用组件。
 * default 模式的爆裂多边形只是它自己的私有实现，不对外暴露。
 * 如果你想做频谱背景，请自己读取 spectrumData 并从底层 Canvas API 开始画。
 */
export interface BackgroundRenderer {
  /** 画布尺寸变化时初始化 */
  init(canvasWidth: number, canvasHeight: number): void
  /** 每帧更新背景状态（dt=时间因子, spectrumData=256点频谱数组） */
  update(dt: number, spectrumData: number[]): void
  /** 绘制背景层 */
  draw(ctx: CanvasRenderingContext2D): void
}

/**
 * 空背景渲染器：用于不需要背景效果的模式。
 * 每个模式必须挂载一个 BackgroundRenderer，什么都不做就挂这个。
 */
export class NoOpBackgroundRenderer implements BackgroundRenderer {
  init() {}
  update() {}
  draw() {}
}

/** 完整的渲染模式接口（包含可执行函数） */
export interface LyricRenderMode extends LyricModeManifest {
  /** 初始化行与字的数据 */
  initNode(node: LyricNode, tempCtx: CanvasRenderingContext2D): void

  /** 每帧更新行与字的状态 */
  updateNode(node: LyricNode, dt: number, externalWordIndex: number): void

  /** 绘制层 2: 歌词文本 */
  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D): void

  /** 绘制层 3: 追踪光标 */
  drawCursor(node: LyricNode, ctx: CanvasRenderingContext2D): void

  /** 全局背景/频谱效果的生命周期（不需要就挂 new NoOpBackgroundRenderer()） */
  backgroundRenderer: BackgroundRenderer
}
