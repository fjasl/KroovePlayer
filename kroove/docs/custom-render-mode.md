# Kroove 自定义歌词渲染模式开发指南

> 本文档面向希望为 Kroove 播放器开发自定义全屏歌词渲染效果的前端开发者。你将学习如何利用后端推送的实时播放数据，结合前端 Canvas API，实现任何你能想象的歌词动画。

---

## 一、架构概述：插件化的渲染系统

Kroove 的全屏歌词渲染采用了**插件化架构**。每一个渲染效果（如默认的粒子飞入、打字机效果）都是一个独立的**渲染模式 (Render Mode)**，由以下两部分组成：

1. **`manifest.json`**：纯元数据（名称、描述、作者等），体积极小，后端也能读取。
2. **`index.ts`**：真正的实现代码，包含 **5 个生命周期成员**（4 个歌词钩子 + 1 个背景渲染器），按需懒加载。

系统通过 `import.meta.glob` 自动扫描 `src/composables/render/` 下的所有子文件夹。**添加新模式时，你完全不需要修改任何现有代码**，只需新建一个文件夹即可。

---

## 二、核心数据结构

在动手写效果之前，必须熟悉两个核心类。它们定义在 `src/composables/lyricSprites.ts` 中。

### 2.1 WordSprite（逐字精灵）

每一行歌词会被拆分成多个 `WordSprite`。对于逐字歌词（`.lrc` 或 `.qrc`），一个字就是一个 `WordSprite`；对于整行歌词，一整行就是一个 `WordSprite`。

```ts
class WordSprite {
  text: string           // 文字内容，如 "只" 或 "hello"
  start: number          // 相对行首的开始时间（毫秒）
  duration: number       // 该字的持续时间（毫秒）
  opacity: number        // 当前透明度（由渲染模式管理）

  // 坐标系：以行中心为原点 (0,0)
  targetRelX: number     // 最终静止位置 X
  targetRelY: number     // 最终静止位置 Y
  originX: number        // 动画起始位置 X（如飞入的起点）
  originY: number        // 动画起始位置 Y
  currentX: number       // 当前绘制位置 X（每帧更新）
  currentY: number       // 当前绘制位置 Y

  isActivated: boolean   // 是否已被激活（可以自定义语义）
  activatedTime: number  // 首次被激活的时间戳
  assemblyDelay: number  // 入场延迟（毫秒）

  pluginData: any        // 【关键】供你存储自定义数据的沙盒
}
```

> **重要**：`start` 和 `duration` 是**相对行首**的时间（毫秒）。这意味着你可以直接拿 `node.elapsed`（当前行已播放时长）和 `word.start` 做比较，来判断这个字应该处于什么状态。

### 2.2 LyricNode（行级容器）

每一行歌词对应一个 `LyricNode`，它持有这行所有的 `WordSprite`，并管理整体状态。

```ts
class LyricNode {
  text: string           // 整行文本
  words: WordSprite[]    // 这行包含的所有字
  startTime: number      // 这行歌词在页面上开始渲染的时间戳 (performance.now())
  x: number              // 画布上的绝对中心 X
  y: number              // 画布上的绝对中心 Y
  opacity: number        // 整行透明度（入场/离场用）
  isExiting: boolean     // 是否正在离场（下一行要来了）
  fontSize: number       // 默认 42，可在 initNode 中修改

  // 追踪光标（Caret）系统
  trackX: number         // 光标当前 X（相对于行中心）
  trackY: number         // 光标当前 Y（相对于行基线）
  trackW: number         // 光标宽度（可用于做背景高亮块）
  trackOpacity: number   // 光标透明度

  // 渲染状态
  elapsed: number        // 当前行已经播放了多少毫秒（实时更新）
  activeWordIndex: number // 当前唱到第几个字（后端同步）
  isFirstUpdate: boolean  // 是否是首次 update（用于光标位置初始化）

  pluginData: any        // 【关键】整行级别的自定义数据沙盒
}
```

> **注意 `startTime` 的玄机**：当你跳到一首歌的中间时，系统会通过 `initialElapsed` 校准 `startTime = performance.now() - initialElapsed`。因此 `node.elapsed` 始终与音频播放时间对齐，无需你手动处理 seek 偏移。

---

## 三、你能获取到的全部信息

### 3.1 后端通过 WebSocket 实时推送

这些数据保存在 `playerStore`（Pinia）中，由 `useCanvasEngine.ts` 中的 `watch` 监听并传递给渲染系统：

| 数据 | 类型 | 说明 |
|------|------|------|
| `currentLineIndex` | `number` | 当前唱到哪一行歌词（全局索引） |
| `wordIndex` | `number` | 当前行内唱到第几个字 |
| `wordProgress` | `number` | 当前字的播放进度 `0.0 ~ 1.0` |
| `lineProgress` | `number` | 当前行的播放进度 `0.0 ~ 1.0` |
| `currentTime` | `number` | 歌曲当前播放时间（秒） |
| `duration` | `number` | 歌曲总时长（秒） |
| `isPlaying` | `boolean` | 是否在播放中 |
| `spectrumData` | `number[]` | 256 点频谱数据（需要 `enableSpectrum`） |

> **传入渲染层的方式**：`updateNode(node, dt, externalWordIndex)` 的第三个参数就是 `wordIndex`。`lineProgress` 和 `wordProgress` 目前不会直接传入，但你可以通过 `playerStore` 访问——**不过更好的做法是基于 `node.elapsed` 和 `word.start/duration` 自己计算**。

### 3.2 前端自己计算的信息

| 数据 | 获取方式 | 说明 |
|------|----------|------|
| `node.elapsed` | `performance.now() - node.startTime` | 当前行已播放毫秒数，**最可靠的时间基准** |
| `dt` | `requestAnimationFrame` 帧差 | 时间归一化因子，1.0 ≈ 16.67ms |
| `canvas.width/height` | `lyricCanvasRef.value` | 画布尺寸（已处理横竖屏） |
| `word.start` / `word.duration` | `WordSprite` 属性 | 相对行首的时间 |

---

## 四、五个生命周期成员

每个渲染模式必须实现 `LyricRenderMode` 接口的 5 个成员：

```ts
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

  /** 绘制层 1: 背景/频谱效果（不需要就挂 new NoOpBackgroundRenderer()） */
  backgroundRenderer: BackgroundRenderer
}
```

> 引擎按 **Layer 1 → Layer 2 → Layer 3** 的顺序绘制，并独立控制开关：
> - `enableSpectrum` 控制背景层是否更新和绘制
> - `enableLyricsAnimation` 控制歌词层和光标层
>
> 每个模式自己决定背景层画什么，引擎只负责在正确的时机调用 `init/update/draw`。

### 4.1 initNode —— 布局与初始化

**调用时机**：当一行歌词首次出现在画布上时（切歌、或切到下一行）。

**职责**：
- 使用 `tempCtx.measureText()` 计算每个字的精确宽度。
- 设定每个 `WordSprite` 的 `targetRelX/Y`（最终位置）和 `originX/Y`（动画起点）。
- 初始化 `node.pluginData`（存储你需要的自定义状态）。
- 初始化 `node.trackX/Y`（光标的初始位置）。

**坐标系**：`initNode` 中通常以**行中心**为原点 `(0, 0)`，因为 `drawLyrics` 里会先 `ctx.translate(node.x, node.y)`。

> **技巧**：`tempCtx` 是一个离屏 Canvas 的 2D 上下文，专门给你测量文字用的。你可以放心地修改它的 `font`，不会影响实际绘制。

### 4.2 updateNode —— 每帧状态更新

**调用时机**：`requestAnimationFrame` 每一帧。

**职责**：
- 更新 `node.elapsed`（虽然引擎也会更新，但建议在开头自己算一遍确保准确）。
- 根据时间或 `externalWordIndex` 更新每个字的 `currentX/Y`、`opacity`、`pluginData`。
- 更新 `node.trackX/Y`（光标追踪逻辑）。
- 处理 `node.isExiting`（离场动画）。

**关于 `dt`**：
`dt` 是基于 60fps 归一化的时间因子。`dt = 1.0` 表示经过了约 16.67ms。
- 如果你希望动画速度不受帧率影响，位移应乘以 `dt`：`w.currentX += speed * dt`
- 如果你希望用指数缓动（如 `factor = 1 - exp(-t/450)`），通常不需要乘 `dt`，因为它基于真实时间 `elapsed`。

### 4.3 drawLyrics —— 绘制歌词

**调用时机**：`requestAnimationFrame` 每一帧，在 `updateNode` 之后。

**职责**：
- 遍历 `node.words`，使用 `ctx.fillText(w.text, w.currentX, w.currentY)` 绘制每个字。
- 处理 `ctx.globalAlpha`、`ctx.shadowBlur`、`ctx.fillStyle` 等视觉属性。
- **不要**在 `drawLyrics` 里做复杂的状态计算，只做纯绘制。

**标准开头**：
```ts
drawLyrics(node, ctx) {
  ctx.save()
  ctx.translate(node.x, node.y)   // 移动到行中心
  ctx.globalAlpha = Math.max(0, node.opacity)
  // ... 绘制逻辑
  ctx.restore()
}
```

### 4.4 drawCursor —— 绘制光标/追踪器

**调用时机**：`requestAnimationFrame` 每一帧，在 `drawLyrics` **之后**。

**职责**：
- 在 `node.trackX / trackY` 位置绘制光标（竖线、下划线、高亮块等）。
- 处理闪烁效果（通常用 `sin(phase)`）。

> **为什么分层绘制？** 因为光标需要在所有字的上方，所以单独作为一个绘制层。

---

## 五、实战：从零写一个 "RainbowBounce" 渲染模式

下面我们实现一个简单但完整的效果：**彩虹弹跳字**。
- 字从下方弹入
- 当前激活的字放大并变色
- 已唱过的字渐变为彩虹色
- 带一个闪烁竖线光标

### 5.1 创建文件夹和文件

在 `src/composables/render/` 下新建文件夹：

```
rainbow-bounce/
  ├── manifest.json
  └── index.ts
```

### 5.2 manifest.json

```json
{
  "id": "rainbow-bounce",
  "name": "弦乐共振",
  "description": "12条频谱琴弦随音乐振动，暖色调共鸣文字与金色光标。",
  "author": "You",
  "version": "1.0.0"
}
```

### 5.3 index.ts 完整实现

```ts
import type { LyricRenderMode, BackgroundRenderer } from '../types'
import type { LyricNode, WordSprite } from '../../lyricSprites'
import manifest from './manifest.json'

// ============================================================
//  String Resonance 背景渲染器："弦乐共振" 频谱动效
//  12 条横跨画布的琴弦，各自监听不同频段，随音乐能量振动。
//  低频弦粗而暖（深红铜），中频弦亮而金（琥珀），高频弦细而冷（银白）。
//  ============================================================
interface StringLine {
  y: number
  baseFreq: number
  phase: number
  amplitude: number
  targetAmplitude: number
  color: string
  glowColor: string
  bandStart: number
  bandEnd: number
  thickness: number
}

class StringResonanceRenderer implements BackgroundRenderer {
  private strings: StringLine[] = []
  private width = 0
  private height = 0
  private time = 0

  init(canvasWidth: number, canvasHeight: number) {
    this.width = canvasWidth
    this.height = canvasHeight
    this.time = 0
    const count = 12
    this.strings = []
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1)
      const y = canvasHeight * 0.12 + t * canvasHeight * 0.76
      let bandStart: number, bandEnd: number
      let color: string, glowColor: string
      let thickness: number, baseFreq: number
      if (t < 0.33) {
        bandStart = Math.floor(0 + t * 60); bandEnd = bandStart + 15
        const warmth = t / 0.33
        color = warmth < 0.5 ? '#6B1A10' : '#A0522D'
        glowColor = warmth < 0.5 ? 'rgba(107, 26, 16, 0.6)' : 'rgba(160, 82, 45, 0.5)'
        thickness = 2.2 - warmth * 0.6; baseFreq = 1.5 + warmth * 1.5
      } else if (t < 0.66) {
        bandStart = Math.floor(20 + (t - 0.33) * 120); bandEnd = bandStart + 25
        const mid = (t - 0.33) / 0.33
        color = mid < 0.5 ? '#B8860B' : '#DAA520'
        glowColor = mid < 0.5 ? 'rgba(184, 134, 11, 0.5)' : 'rgba(218, 165, 32, 0.4)'
        thickness = 1.5; baseFreq = 3 + mid * 2
      } else {
        bandStart = Math.floor(60 + (t - 0.66) * 120); bandEnd = Math.min(255, bandStart + 30)
        const high = (t - 0.66) / 0.34
        color = high < 0.5 ? '#A9A9A9' : '#B0A0C0'
        glowColor = high < 0.5 ? 'rgba(169, 169, 169, 0.4)' : 'rgba(176, 160, 192, 0.35)'
        thickness = 0.8; baseFreq = 5 + high * 4
      }
      this.strings.push({
        y, baseFreq, phase: Math.random() * Math.PI * 2,
        amplitude: 0, targetAmplitude: 0,
        color, glowColor, bandStart, bandEnd, thickness
      })
    }
  }

  update(dt: number, spectrumData: number[]) {
    this.time += dt * 0.016
    this.strings.forEach(s => {
      let sum = 0, count = 0
      for (let i = s.bandStart; i < s.bandEnd && i < spectrumData.length; i++) {
        sum += spectrumData[i]; count++
      }
      const energy = count > 0 ? sum / count : 0
      const energyBoost = Math.min(1, energy * 40)
      s.targetAmplitude = energyBoost * 40
      s.amplitude += (s.targetAmplitude - s.amplitude) * 0.12 * dt
      s.phase += (s.baseFreq * 0.08 + energyBoost * 0.15) * dt
    })
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    this.strings.forEach(s => {
      ctx.beginPath(); ctx.strokeStyle = s.color
      ctx.globalAlpha = 0.08; ctx.lineWidth = s.thickness
      ctx.moveTo(0, s.y); ctx.lineTo(this.width, s.y); ctx.stroke()
    })
    ctx.restore()
    ctx.save()
    this.strings.forEach(s => {
      if (s.amplitude < 0.5) return
      const segments = 80; ctx.beginPath()
      for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * this.width
        const wave1 = Math.sin(s.phase + i * 0.15) * s.amplitude
        const wave2 = Math.sin(s.phase * 1.7 + i * 0.25) * s.amplitude * 0.4
        const y = s.y + wave1 + wave2
        if (i === 0) ctx.moveTo(x, y) else ctx.lineTo(x, y)
      }
      const intensity = Math.min(1, s.amplitude / 20)
      ctx.shadowColor = s.glowColor; ctx.shadowBlur = 8 + intensity * 16
      ctx.strokeStyle = s.color; ctx.globalAlpha = 0.25 + intensity * 0.55
      ctx.lineWidth = s.thickness * (1 + intensity * 0.8); ctx.stroke()
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.4 + intensity * 0.5
      ctx.lineWidth = s.thickness * 0.5; ctx.stroke()
    })
    ctx.restore()
    ctx.save()
    this.strings.forEach(s => {
      ctx.fillStyle = s.color; ctx.globalAlpha = 0.2
      ctx.beginPath(); ctx.arc(8, s.y, 2, 0, Math.PI * 2)
      ctx.arc(this.width - 8, s.y, 2, 0, Math.PI * 2); ctx.fill()
    })
    ctx.restore()
  }
}

const stringBg = new StringResonanceRenderer()

export const RainbowBounceMode: LyricRenderMode = {
  id: manifest.id,
  name: manifest.name,
  backgroundRenderer: stringBg,

  // ====== 1. 初始化：计算布局 ======
  initNode(node, tempCtx) {
    node.fontSize = 48
    const GAP = 14
    tempCtx.font = `300 ${node.fontSize}px "Segoe UI", "PingFang SC", sans-serif`
    let totalW = 0
    const widths: number[] = []
    node.words.forEach(w => {
      const ww = tempCtx.measureText(w.text).width
      widths.push(ww); totalW += ww + GAP
    })
    totalW -= GAP
    let cx = -totalW / 2
    node.words.forEach((w, i) => {
      w.targetRelX = cx + widths[i] / 2
      w.targetRelY = 0
      const fromTop = i % 2 === 0
      w.originX = w.targetRelX + (Math.random() - 0.5) * 20
      w.originY = w.targetRelY + (fromTop ? -120 : 120)
      w.currentX = w.originX; w.currentY = w.originY
      w.opacity = 0; w.isActivated = false; w.assemblyDelay = i * 35
      w.pluginData.width = widths[i]
      w.pluginData.floatPhase = Math.random() * Math.PI * 2
      w.pluginData.floatSpeed = 0.02 + Math.random() * 0.02
      cx += widths[i] + GAP
    })
    if (node.words.length > 0) {
      const f = node.words[0]
      node.trackX = f.targetRelX + (f.pluginData.width || 20) / 2 + 6
      node.trackY = 0; node.trackOpacity = 0
    }
    node.pluginData.resonancePhase = 0
  },

  // ====== 2. 每帧更新 ======
  updateNode(node, dt, externalWordIndex) {
    node.elapsed = performance.now() - node.startTime
    node.activeWordIndex = externalWordIndex
    node.opacity += (1 - node.opacity) * 0.1
    const safeDt = Number.isFinite(dt) ? dt : 1
    node.pluginData.resonancePhase = (node.pluginData.resonancePhase || 0) + safeDt * 0.06
    node.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true; w.activatedTime = performance.now()
      }
    })
    node.words.forEach((w) => {
      if (node.isExiting) { w.opacity *= 0.88; w.currentY -= 1.5 * safeDt; return }
      if (!w.isActivated) { w.opacity = 0; return }
      const elapsed = performance.now() - w.activatedTime
      const delay = w.assemblyDelay
      const t = Math.max(0, elapsed - delay)
      if (t <= 0) { w.opacity = 0; return }
      const factor = Math.min(1, t / 500)
      const yEase = 1 - Math.pow(1 - factor, 4)
      const overshoot = Math.sin(factor * Math.PI * 1.2) * 0.08 * (1 - factor)
      w.currentX = w.originX + (w.targetRelX - w.originX) * yEase
      w.currentY = w.originY + (w.targetRelY - w.originY) * yEase + overshoot * 20
      if (factor >= 1) {
        w.pluginData.floatPhase += w.pluginData.floatSpeed * safeDt
        w.currentY += Math.sin(w.pluginData.floatPhase) * 2
      }
      w.opacity = Math.min(1, t / 200)
    })
    if (!node.isExiting && externalWordIndex >= 0 && externalWordIndex < node.words.length) {
      const aw = node.words[externalWordIndex]
      const halfW = (aw.pluginData.width || 20) / 2
      const tx = aw.targetRelX + halfW + 6
      const ty = aw.targetRelY + Math.sin(node.pluginData.resonancePhase) * 3
      node.trackOpacity += (1 - node.trackOpacity) * 0.12
      if (node.isFirstUpdate) {
        node.trackX = tx; node.trackY = ty; node.isFirstUpdate = false
      } else {
        node.trackX += (tx - node.trackX) * 0.2 * safeDt
        node.trackY += (ty - node.trackY) * 0.2 * safeDt
      }
    } else if (node.isExiting) {
      node.trackOpacity *= 0.85
    } else {
      node.isFirstUpdate = false
    }
  },

  // ====== 3. 绘制歌词（暖色调共鸣文字） ======
  drawLyrics(node, ctx) {
    ctx.save()
    ctx.translate(node.x, node.y)
    ctx.globalAlpha = Math.max(0, node.opacity)
    node.words.forEach((w, i) => {
      if (w.opacity < 0.005) return
      ctx.save(); ctx.translate(w.currentX, w.currentY)
      ctx.font = `300 ${node.fontSize}px "Segoe UI", "PingFang SC", sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.globalAlpha = node.opacity * w.opacity
      const isCurrent = i === node.activeWordIndex && !node.isExiting
      const isActivated = w.isActivated && !node.isExiting
      if (isCurrent) {
        ctx.fillStyle = '#FFFFFF'
        ctx.shadowColor = 'rgba(218, 165, 32, 0.8)'; ctx.shadowBlur = 24
      } else if (isActivated) {
        const t = Math.min(1, (node.words.length - Math.abs(i - node.activeWordIndex)) / node.words.length)
        const r = 200 + t * 35, g = 170 - t * 40, b = 110 - t * 50
        ctx.fillStyle = `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`
        ctx.shadowColor = 'rgba(184, 134, 11, 0.25)'; ctx.shadowBlur = 8
      } else {
        ctx.fillStyle = 'rgba(180, 160, 120, 0.12)'; ctx.shadowBlur = 0
      }
      ctx.fillText(w.text, 0, 0); ctx.restore()
    })
    ctx.restore()
  },

  // ====== 4. 绘制光标（共鸣柱） ======
  drawCursor(node, ctx) {
    if (node.trackOpacity < 0.01 || node.isExiting) return
    ctx.save(); ctx.translate(node.x, node.y)
    const phase = node.pluginData.resonancePhase || 0
    const breath = 0.5 + 0.5 * Math.sin(phase * 1.3)
    ctx.globalAlpha = node.opacity * node.trackOpacity * (0.6 + breath * 0.4)
    const h = node.fontSize * 1.1, x = node.trackX, y = node.trackY
    ctx.beginPath()
    const jitter = Math.sin(phase * 3) * 0.8
    ctx.moveTo(x + jitter, y - h / 2); ctx.lineTo(x - jitter, y + h / 2)
    ctx.strokeStyle = '#DAA520'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(218, 165, 32, 0.8)'; ctx.shadowBlur = 14; ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y + h / 2 + 4, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(218, 165, 32, 0.6)'; ctx.fill()
    ctx.beginPath(); ctx.arc(x + jitter * 0.5, y - h / 2, 2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.fill()
    ctx.restore()
  }
}
```

### 5.4 完成！系统自动加载

保存文件后，系统会在下次启动时通过 `import.meta.glob` 自动发现你的 `rainbow-bounce` 文件夹。

如果你希望在设置面板里看到它，后端已经提供了一个 `/api/render/modes` 接口，它会自动读取所有 `manifest.json` 返回给前端。由于你是新增文件夹，接口会自动包含它，无需任何配置。

---

## 六、高级技巧

### 6.1 基于时间轴的状态机（解决跳入中间重触发问题）

如果你希望实现类似"打字机"或"拼音拼写"的效果，最大的坑是：**用户可能跳到一首歌的中间，此时你不希望前面的字重新播放一遍动画**。

**错误做法**（基于字索引触发）：
```ts
if (externalWordIndex >= block.startIdx) {
  block.charPhase = 1  // 触发拼音输入动画
}
```
> 问题：跳入中间时，`externalWordIndex` 可能直接等于 5，导致前面的 block 0~4 都满足条件，全部开始播放动画。

**正确做法**（基于歌词时间轴）：
```ts
const firstWord = node.words[block.startIdx]
const lastWord = node.words[block.endIdx - 1]
const blockStartMs = firstWord.start
const blockEndMs = lastWord.start + lastWord.duration
const elapsed = node.elapsed  // 当前行已播放毫秒数

if (elapsed >= blockEndMs) {
  // 这个 block 的时间已经完全过去了 → 直接显示完成状态
  block.charPhase = 3
} else if (elapsed >= blockStartMs) {
  // 正在播放中 → 根据 elapsed 精确计算动画进度
  const blockElapsed = elapsed - blockStartMs
  const prog = Math.min(1, blockElapsed / pyDur)
  block.visiblePinyinCount = Math.ceil(prog * block.pinyinLen)
} else {
  // 还没到 → 保持等待
  block.charPhase = 0
}
```

> **核心原则**：用 `node.elapsed` 和 `word.start/duration` 做时间比较，而不是用 `externalWordIndex` 做事件触发。这样无论用户从哪里开始播放，动画状态都是**时间函数**，天然正确。

### 6.2 拼音/拼写块的实现思路

如果你想实现类似内置 `typewriter` 那种"先显示拼音/字母，再显示汉字/单词"的效果，核心思路是：

1. **在 `initNode` 中分块**：把相邻的 1~3 个字组成一个 Block。
2. **每个 Block 计算拼写内容**：
   - CJK 汉字 → `pinyin(text, { toneType: 'none' })`
   - 英文 → `text.toLowerCase()`
3. **Block 状态机**：
   - `phase 0`: 等待（字隐藏）
   - `phase 1`: 拼写中（显示拼音/字母，逐字出现）
   - `phase 2`: 确认中（汉字/单词淡入，拼写淡出）
   - `phase 3`: 完成（稳定显示）
4. **光标追踪**：
   - `phase 1` 期间，光标跟随已输入拼写的末尾。
   - `phase 2/3` 期间，光标固定在整个 Block 最后一个字的右边缘，**不要**跟随 `externalWordIndex` 对应的单个字（否则会跳）。

### 6.3 底部进度条

如果你想做一条随播放进度增长的下划线或进度条，可以维护一个 `typedRightEdge`：

```ts
// 在 updateNode 中
node.pluginData.typedRightEdge = currentWord.targetRelX + halfW

// 在 drawLyrics 中
const firstW = node.words[0]
const lastW = node.words[node.words.length - 1]
const lineLeft = firstW.targetRelX - firstW.pluginData.width / 2
const lineRight = lastW.targetRelX + lastW.pluginData.width / 2
const progressX = node.pluginData.typedRightEdge || lineLeft

ctx.fillStyle = 'rgba(255,255,255,0.1)'
ctx.fillRect(lineLeft, 30, lineRight - lineLeft, 2) // 背景条
ctx.fillStyle = '#fff'
ctx.fillRect(lineLeft, 30, progressX - lineLeft, 2) // 进度条
```

### 6.4 性能优化

1. **避免在 `drawLyrics` 中调用 `measureText`**：字体不变时，文字宽度是固定的，应在 `initNode` 中预存到 `pluginData.width`。
2. **减少 `save/restore` 嵌套**：如果一批字使用相同的 `font`、`textAlign`，可以在循环外设置，循环内只做 `translate/fillText`。
3. **及时清理离场节点**：`useCanvasEngine` 会在切行时把旧节点标记为 `isExiting = true`。你的 `updateNode` 应该在 `opacity < 0.01` 后停止计算，或让引擎自动 `splice` 移除（目前引擎会在 `opacity < 0.01` 时从 `activeNodes` 移除，但你需要在 `updateNode` 里把 `opacity` 降下来）。

---

## 七、调试技巧

### 7.1 使用 Vue DevTools 观察 Store

打开浏览器 DevTools → Vue → Pinia → `player`，可以实时看到：
- `currentLineIndex`
- `wordIndex`
- `wordProgress`
- `lineProgress`
- `spectrumData`

### 7.2 在 Console 打印节点状态

在 `updateNode` 开头加日志：
```ts
if (node.words[0]?.text === '你想调试的那句词') {
  console.log('elapsed:', node.elapsed, 'phase:', node.pluginData.myPhase)
}
```

### 7.3 绘制辅助线

在 `drawLyrics` 末尾临时画一个坐标轴原点，确认你的坐标计算是否正确：
```ts
// debug: 画一个红点标记行中心
ctx.fillStyle = 'red'
ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
```

### 7.4 热重载

Vite 支持热重载，但**动态懒加载的 `import.meta.glob` 模块在开发时可能缓存**。如果修改了渲染模式代码但界面没变化，尝试：
1. 在设置面板切换到另一个模式，再切回来。
2. 或者刷新页面（F5）。

---

## 八、总结

开发一个 Kroove 自定义渲染模式，本质上就是填空 5 个成员：

| 成员 | 做什么 | 不要做什么 |
|------|--------|-----------|
| `initNode` | 计算布局、设定动画起点、初始化自定义数据 | 不要做动画计算 |
| `updateNode` | 每帧更新位置/透明度/状态、追踪光标 | 不要调用 Canvas API |
| `drawLyrics` | 纯绘制文字和装饰 | 不要做状态计算、不要改数据 |
| `drawCursor` | 绘制光标或高亮框 | — |
| `backgroundRenderer` | 管理背景/频谱效果的 `init/update/draw` | 不要在这里操作歌词状态 |

**记住两个核心坐标系**：
- **绝对坐标**：`(node.x, node.y)`，对应画布中心附近。
- **相对坐标**：`(word.targetRelX, word.targetRelY)`，以行中心为原点。`drawLyrics` 中先 `translate(node.x, node.y)` 再绘制。

**记住最可靠的时间基准**：
`node.elapsed` + `word.start/duration`。基于时间的状态机永远比基于索引的事件触发更健壮。

现在，去 `src/composables/render/` 下新建一个文件夹，开始你的创作吧！
