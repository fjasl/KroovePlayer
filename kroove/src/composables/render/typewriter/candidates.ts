import { pinyin } from 'pinyin-pro'

// ========== 全局常用字池 (约400字, 按使用频率降序) ==========
// 覆盖绝大多数常用音节，确保每个拼音前缀都有足够候选
const EXTENDED_CHARS =
  '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取完举色'

function isCJK(ch: string): boolean {
  const c = ch.codePointAt(0) || 0
  return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)
}

// ========== 预计算拼音索引 ==========
interface CharData {
  char: string
  freqRank: number
}

function buildPinyinIndex(chars: string): Map<string, CharData[]> {
  const map = new Map<string, CharData[]>()
  const uniqueChars: string[] = []
  const seen = new Set<string>()

  for (const ch of chars) {
    if (isCJK(ch) && !seen.has(ch)) {
      seen.add(ch)
      uniqueChars.push(ch)
    }
  }

  if (uniqueChars.length === 0) return map

  // 批量计算拼音（比逐字调用快一个数量级）
  const pinyinArr = pinyin(uniqueChars.join(''), { toneType: 'none', type: 'array' }) as string[]

  for (let i = 0; i < uniqueChars.length; i++) {
    const char = uniqueChars[i]
    const py = (pinyinArr[i] || '').replace(/\s+/g, '')
    if (!py) continue

    // 为每个前缀长度建立索引（模拟输入法从 a -> an -> ang 的逐步缩小）
    for (let len = 1; len <= py.length; len++) {
      const prefix = py.slice(0, len)
      if (!map.has(prefix)) map.set(prefix, [])
      map.get(prefix)!.push({ char, freqRank: i })
    }
  }

  // 每个前缀下按频率排序（高频字在前，模拟真实候选排序）
  for (const arr of map.values()) {
    arr.sort((a, b) => a.freqRank - b.freqRank)
  }
  return map
}

// 全局索引：模块加载时一次性构建（约 5-10ms）
const GLOBAL_PINYIN_INDEX = buildPinyinIndex(EXTENDED_CHARS)

// ========== 歌词上下文管理 ==========
let contextPinyinIndex = new Map<string, CharData[]>()

/**
 * 注入当前歌曲的歌词上下文。
 * 上下文字会被优先作为候选，使候选框与歌曲主题高度相关。
 * 应在切歌时调用一次。
 */
export function setLyricContext(lines: { text: string }[] | undefined) {
  // 切歌时清空旧缓存，防止旧歌候选污染新歌
  candidateCache.clear()
  contextPinyinIndex.clear()

  if (!lines || lines.length === 0) return

  const charSet = new Set<string>()
  for (const line of lines) {
    if (!line.text) continue
    for (const ch of line.text) {
      if (isCJK(ch)) charSet.add(ch)
    }
  }

  if (charSet.size > 0) {
    contextPinyinIndex = buildPinyinIndex(Array.from(charSet).join(''))
  }
}

// ========== 带缓存的候选生成 ==========
const candidateCache = new Map<string, string[]>()

function getCacheKey(real: string, prefix: string, count: number): string {
  return `${real}|${prefix}|${count}`
}

/**
 * 生成输入法风格的候选字列表。
 *
 * 优先级：
 * 1. 歌词上下文中的同音字（与歌曲主题最相关，最真实）
 * 2. 全局高频同音字（兜底，确保数量充足）
 * 3. 更短前缀的回退匹配（模拟输入法的模糊推荐）
 *
 * 结果会被缓存，保证同一前缀的候选在输入过程中稳定不变，避免闪烁。
 */
export function getDynamicCandidates(real: string, prefix: string, count: number): string[] {
  if (!prefix || prefix.length === 0) return [real]

  const cacheKey = getCacheKey(real, prefix, count)
  const cached = candidateCache.get(cacheKey)
  if (cached) return cached

  const result: string[] = [real]
  const seen = new Set<string>([real])

  // --- Tier 1: 歌词上下文中的同音字（最真实） ---
  const ctxMatches = contextPinyinIndex.get(prefix)
  if (ctxMatches) {
    for (const item of ctxMatches) {
      if (result.length >= count) break
      if (!seen.has(item.char)) {
        result.push(item.char)
        seen.add(item.char)
      }
    }
  }

  // --- Tier 2: 全局高频同音字（兜底） ---
  const globalMatches = GLOBAL_PINYIN_INDEX.get(prefix)
  if (globalMatches) {
    for (const item of globalMatches) {
      if (result.length >= count) break
      if (!seen.has(item.char)) {
        result.push(item.char)
        seen.add(item.char)
      }
    }
  }

  // --- Tier 3: 回退到更短前缀的候选（模拟模糊音/少打字母） ---
  if (result.length < count && prefix.length > 1) {
    const shorterPrefix = prefix.slice(0, -1)
    const fallbackCacheKey = getCacheKey(real, shorterPrefix, count)
    const fallbackCached = candidateCache.get(fallbackCacheKey)
    if (fallbackCached) {
      for (const ch of fallbackCached) {
        if (result.length >= count) break
        if (!seen.has(ch)) {
          result.push(ch)
          seen.add(ch)
        }
      }
    }
  }

  candidateCache.set(cacheKey, result)
  return result
}
