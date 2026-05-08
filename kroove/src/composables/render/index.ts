import type { LyricRenderMode, LyricModeManifest } from './types'

// ========================================================================
// 自动发现：扫描 render/ 目录下的所有 manifest.json 和实现模块
// 添加新模式时，只需在 render/ 下新建文件夹（manifest.json + index.ts）
// 无需修改此文件！
// ========================================================================

/** 同步加载所有 manifest.json（纯元数据，体积小） */
const manifestModules = import.meta.glob<LyricModeManifest>('./*/manifest.json', {
  eager: true,
  import: 'default'
})

/** 懒加载所有实现模块（包含函数，按需加载） */
const modeModules = import.meta.glob<Record<string, unknown>>('./*/index.ts')

// 建立 modeId -> 模块路径 的映射
const modeIdToPath = new Map<string, string>()
for (const path of Object.keys(modeModules)) {
  const id = path.match(/\.\/(.+?)\/index\.ts/)?.[1]
  if (id) modeIdToPath.set(id, path)
}

// 缓存已加载的渲染实现
const modeCache = new Map<string, LyricRenderMode>()

/** 获取所有可用渲染模式的元数据列表（无需加载实现代码） */
export function getAvailableModes(): LyricModeManifest[] {
  return Object.values(manifestModules)
}

/** 异步加载指定渲染模式的实现代码。首次加载后自动缓存。 */
export async function loadRenderMode(modeId: string): Promise<LyricRenderMode> {
  if (modeCache.has(modeId)) {
    return modeCache.get(modeId)!
  }

  // 优先加载目标模式，fallback 到 default
  const path = modeIdToPath.get(modeId) || modeIdToPath.get('default')
  if (!path || !modeModules[path]) {
    throw new Error(`Render mode "${modeId}" not found and no default fallback available`)
  }

  const mod = await modeModules[path]()

  // 从模块导出中自动找到渲染模式对象（通过 initNode + drawLyrics 特征识别）
  let modeImpl: LyricRenderMode | undefined
  for (const val of Object.values(mod)) {
    if (
      val &&
      typeof val === 'object' &&
      'initNode' in val &&
      typeof (val as Record<string, unknown>).initNode === 'function' &&
      'drawLyrics' in val &&
      typeof (val as Record<string, unknown>).drawLyrics === 'function'
    ) {
      modeImpl = val as LyricRenderMode
      break
    }
  }

  if (!modeImpl) {
    throw new Error(`Render mode "${modeId}" implementation not found in module ${path}`)
  }

  // 合并 manifest 元数据（确保 id/name/description 与 manifest 一致）
  const manifest = manifestModules[`./${modeId}/manifest.json`]
  const merged = { ...manifest, ...modeImpl } as LyricRenderMode

  modeCache.set(modeId, merged)
  return merged
}

/** 同步获取已加载的渲染模式（必须在 loadRenderMode 预加载之后调用） */
export function getRenderMode(modeId: string): LyricRenderMode {
  const mode = modeCache.get(modeId) || modeCache.get('default')
  if (!mode) {
    throw new Error(`Render mode "${modeId}" not loaded yet. Call loadRenderMode() first.`)
  }
  return mode
}

/** 检查指定模式是否已完成加载 */
export function isModeLoaded(modeId: string): boolean {
  return modeCache.has(modeId)
}
