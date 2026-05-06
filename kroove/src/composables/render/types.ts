import type { LyricNode, WordSprite } from '../lyricSprites'

export interface LyricRenderMode {
  id: string
  name: string

  /** 初始化行与字的数据 */
  initNode(node: LyricNode, tempCtx: CanvasRenderingContext2D): void

  /** 每帧更新行与字的状态 */
  updateNode(node: LyricNode, dt: number, externalWordIndex: number): void

  /** 绘制层 2: 歌词文本 */
  drawLyrics(node: LyricNode, ctx: CanvasRenderingContext2D): void

  /** 绘制层 3: 追踪光标 */
  drawCursor(node: LyricNode, ctx: CanvasRenderingContext2D): void
}
