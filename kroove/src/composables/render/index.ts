import type { LyricRenderMode } from './types'
import { DefaultMode } from './default'

// 在这里注册前端所有的渲染插件
const registeredModes: Record<string, LyricRenderMode> = {
  [DefaultMode.id]: DefaultMode
}

/**
 * 前端渲染模式选择服务
 * 根据模式 ID 返回对应的渲染对象，如果未找到则回退到默认模式
 */
export function getRenderMode(modeId: string): LyricRenderMode {
  return registeredModes[modeId] || DefaultMode
}
