import type { LyricNode, WordSprite } from '../lyricSprites'

/** 渲染模式的纯元数据（可被序列化为 JSON，后端可读取） */
export interface LyricModeManifest {
  id: string
  name: string
  description?: string
  author?: string
  version?: string
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
}
