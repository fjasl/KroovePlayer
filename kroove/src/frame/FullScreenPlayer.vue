<!-- src/frame/FullScreenPlayer.vue -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlayerStore } from '../stores/player';
import PlayerButton from '../component/PlayerButton.vue';
import GrooveSlider from '../component/GrooveSlider.vue';

// 基础图标
import IconShuffle from '../assets/icons/IconShuffle.vue';
import IconRepeat from '../assets/icons/IconRepeat.vue';
import IconPrev from '../assets/icons/IconPrev.vue';
import IconNext from '../assets/icons/IconNext.vue';
import IconPlay from '../assets/icons/IconPlay.vue';
import IconPause from '../assets/icons/IconPause.vue';
import IconVolumeMute from '../assets/icons/IconVolumeMute.vue';
import IconVolume0 from '../assets/icons/IconVolume0.vue';
import IconVolume1 from '../assets/icons/IconVolume1.vue';
import IconVolume2 from '../assets/icons/IconVolume2.vue';
import IconMore from '../assets/icons/IconMore.vue';

// 新图
import IconArrowLeft from '../assets/icons/IconArrowLeft.vue';
import IconArrowUp from '../assets/icons/IconArrowUp.vue';
import IconPlaylist from '../assets/icons/IconPlaylist.vue';
import IconLyrics from '../assets/icons/IconLyrics.vue';
import IconFullscreen from '../assets/icons/IconFullscreen.vue';

const playerStore = usePlayerStore();

const currentVolumeIcon = computed(() => {
  if (playerStore.isMuted) return IconVolumeMute;
  if (playerStore.volume === 0) return IconVolume0;
  if (playerStore.volume < 60) return IconVolume1;
  return IconVolume2;
});

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const isIdle = ref(false);
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const resetIdleTimer = () => {
  if (!playerStore.isFullScreen) return;
  isIdle.value = false;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isIdle.value = true;
  }, 3000);
};

const handleMouseMove = () => {
  resetIdleTimer();
};

const closeFullScreen = () => {
  playerStore.isFullScreen = false;
};

// --- Canvas 歌词引擎 2.0 (逐字感知 + 随机特效) ---
import { onMounted, onUnmounted } from 'vue';

const lyricCanvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number | null = null;
let lastTimestamp = 0;

// 动画风格枚举
type EntranceStyle = 'BLAST' | 'GLIDE_UP' | 'ZOOM_IN' | 'ROLL_IN';
type ExitStyle = 'SMOKE' | 'SHATTER' | 'VORTEX' | 'FLIP_OUT';

class WordSprite {
  text: string;
  start: number;
  duration: number;
  opacity: number = 0;

  // 散点定位系统
  targetRelX: number = 0; // 相对于行中心的最终 X
  targetRelY: number = 0; // 相对于行基线的最终 Y
  originX: number = 0;    // 组装起点 X
  originY: number = 0;    // 组装起点 Y

  currentX: number = 0;
  currentY: number = 0;

  isActivated: boolean = false;
  activatedTime: number = 0;
  assemblyDelay: number = 0; // 每个点独立的起步延迟

  constructor(text: string, start: number, duration: number) {
    this.text = text;
    this.start = start;
    this.duration = duration;
  }

  // 初始化组装起点（根据风格决定从哪里飞过来）
  initOrigin(style: EntranceStyle) {
    const range = 150;
    if (style === 'BLAST') {
      this.originX = this.targetRelX * 2;
      this.originY = this.targetRelY * 2;
    } else if (style === 'GLIDE_UP') {
      this.originX = this.targetRelX;
      this.originY = this.targetRelY + range;
    } else {
      this.originX = this.targetRelX + (Math.random() - 0.5) * range;
      this.originY = this.targetRelY + (Math.random() - 0.5) * range;
    }
    this.currentX = this.originX;
    this.currentY = this.originY;
  }

  update(dt: number, isExiting: boolean, exitStyle: ExitStyle) {
    if (!this.isActivated) return;
    if (this.activatedTime === 0) this.activatedTime = performance.now();
    const elapsed = performance.now() - this.activatedTime;

    if (!isExiting) {
      // 组放过程：带 Stagger 延迟的指数衰减
      const assemblyElapsed = Math.max(0, elapsed - this.assemblyDelay);

      // 【核心修复】如果该词早就该入场了（差距超过 500ms），直接跳过动画进入锁定位置
      if (assemblyElapsed > 500) {
        this.currentX = this.targetRelX;
        this.currentY = this.targetRelY;
        this.opacity = 1;
      } else {
        const factor = 1 - Math.exp(-assemblyElapsed / 450);
        this.currentX = this.originX + (this.targetRelX - this.originX) * factor;
        this.currentY = this.targetRelY + (this.targetRelY - this.targetRelY) * factor; // 维持基线
        this.opacity = factor;
      }
    } else {
      // 溃散过程
      this.opacity *= 0.9;
      if (exitStyle === 'SHATTER') {
        this.currentY += 5;
        this.currentX += (Math.random() - 0.5) * 4;
      } else {
        this.currentX += (this.targetRelX) * 0.1;
        this.currentY += (this.targetRelY) * 0.1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, baseOpacity: number) {
    if (!this.isActivated && this.opacity < 0.01) return;
    ctx.save();
    ctx.translate(this.currentX, this.currentY);
    ctx.globalAlpha = baseOpacity * this.opacity;
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
}

class LyricNode {
  text: string;
  words: WordSprite[] = [];
  startTime: number;
  x: number;
  y: number;
  opacity: number = 0;
  rotation: number = 0;
  isExiting: boolean = false;
  fontSize: number;

  // 追踪光标系统
  trackX: number = 0;
  trackY: number = 0;
  trackW: number = 0;
  trackOpacity: number = 0;

  entranceStyle: EntranceStyle;
  exitStyle: ExitStyle;
  elapsed: number = 0;
  isFirstUpdate: boolean = true;
  activeWordIndex: number = -1; // 由后端 wordIndex 驱动，直接定位当前活动词

  constructor(lineData: any, canvasWidth: number, canvasHeight: number, tempCtx: CanvasRenderingContext2D, initialElapsed: number = 0) {
    this.text = lineData.text;
    this.startTime = performance.now() - initialElapsed;
    this.fontSize = 42;

    // 基础中心点
    this.x = canvasWidth / 2;
    this.y = canvasHeight / 2 + (Math.random() - 0.5) * 40;

    // 随机风格
    const entrances: EntranceStyle[] = ['BLAST', 'GLIDE_UP', 'ZOOM_IN', 'ROLL_IN'];
    const exits: ExitStyle[] = ['SMOKE', 'SHATTER', 'VORTEX', 'FLIP_OUT'];
    this.entranceStyle = entrances[Math.floor(Math.random() * entrances.length)];
    this.exitStyle = exits[Math.floor(Math.random() * exits.length)];

    // 【核心核心】散点布局算法
    if (lineData.words && lineData.words.length > 0) {
      tempCtx.font = `bold ${this.fontSize}px sans-serif`;

      let totalW = 0;
      const wordWidths: number[] = [];
      const gaps: number[] = [];

      // 1. 预计算总宽度和随机间距
      lineData.words.forEach((w: any) => {
        const wWidth = tempCtx.measureText(w.text).width;
        wordWidths.push(wWidth);
        const gap = 12 + Math.random() * 20; // 散乱间距
        gaps.push(gap);
        totalW += wWidth + gap;
      });
      totalW -= gaps[gaps.length - 1];

      // 2. 赋予每个词独立的散点坐标
      let currentX = -totalW / 2;
      this.words = lineData.words.map((w: any, i: number) => {
        const sprite = new WordSprite(w.text, (w.start - lineData.start) * 1000, w.duration * 1000);
        sprite.targetRelX = currentX + wordWidths[i] / 2;
        sprite.targetRelY = (Math.random() - 0.5) * 30; // 随机基线错位
        sprite.initOrigin(this.entranceStyle);
        sprite.assemblyDelay = Math.random() * 200; // 0~200ms 的随机起跳延迟
        currentX += wordWidths[i] + gaps[i];
        return sprite;
      });
    } else {
      // 兼容非逐字行
      const sprite = new WordSprite(this.text, 0, 3000);
      sprite.targetRelX = 0;
      sprite.targetRelY = 0;
      sprite.initOrigin(this.entranceStyle);
      sprite.isActivated = true;
      this.words = [sprite];
    }

    // 初始化光标位置到第一个词，避免突发跳变
    if (this.words.length > 0) {
      this.trackX = this.words[0].originX;
      this.trackY = this.words[0].originY;
      this.trackW = 20;
    }
  }

  // externalWordIndex: 后端实时推送的当前字索引（-1 表示无活动字或非逐字行）
  update(dt: number, externalWordIndex: number) {
    this.elapsed = performance.now() - this.startTime;
    this.activeWordIndex = externalWordIndex;

    // 基础透明度渐入
    this.opacity += (1 - this.opacity) * 0.1;

    // 用后端 wordIndex 驱动词语激活：激活所有 index <= externalWordIndex 的词
    let currentActiveWord: WordSprite | null = null;
    this.words.forEach((w, i) => {
      if (!w.isActivated && externalWordIndex >= 0 && i <= externalWordIndex) {
        w.isActivated = true;
      }
      w.update(dt, this.isExiting, this.exitStyle);
    });

    // 直接用后端 wordIndex 定位光标追踪目标，无需本地时钟估算
    if (!this.isExiting && externalWordIndex >= 0 && externalWordIndex < this.words.length) {
      currentActiveWord = this.words[externalWordIndex];
    }

    if (currentActiveWord) {
      this.trackOpacity += (1 - this.trackOpacity) * 0.1;

      // 【关键修复】如果该行是中途切入的第一帧，光标直接"瞬移"到对应词，不要滑行
      if (this.isFirstUpdate) {
        this.trackX = currentActiveWord.currentX;
        this.trackY = currentActiveWord.currentY;
        this.isFirstUpdate = false;
      } else {
        // 增加安全检查，防止 dt 异常
        const safeDt = Number.isFinite(dt) ? dt : 1;
        this.trackX += (currentActiveWord.currentX - this.trackX) * 0.15 * safeDt;
        this.trackY += (currentActiveWord.currentY - this.trackY) * 0.15 * safeDt;
      }
    } else {
      this.trackOpacity *= 0.9;
      this.isFirstUpdate = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = Math.max(0, this.opacity);

    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowBlur = 12;
    ctx.font = `bold ${this.fontSize}px sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';

    // A. 绘制追踪光标 (在文字下方)
    if (this.trackOpacity > 0.01) {
      let activeW = 0;
      // 找到当前词计算宽度
      // 直接使用后端驱动的 activeWordIndex，不再用本地时钟估算
      const activeWord = this.activeWordIndex >= 0 && this.activeWordIndex < this.words.length
        ? this.words[this.activeWordIndex] : null;
      if (activeWord) {
        activeW = ctx.measureText(activeWord.text).width + 16;
        // 平滑宽度变化
        this.trackW += (activeW - this.trackW) * 0.2;
      }

      ctx.save();
      ctx.translate(this.trackX, this.trackY);
      ctx.globalAlpha = this.opacity * this.trackOpacity * 0.35;
      ctx.fillStyle = '#fff';

      // 添加类似终端光标的微弱光晕
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';

      const height = this.fontSize * 1.1;
      ctx.beginPath();
      ctx.roundRect(-this.trackW / 2, -height / 1.5, this.trackW, height, 4);
      ctx.fill();
      ctx.restore();
    }

    // B. 委派给每个词自己的绘制逻辑
    this.words.forEach(w => w.draw(ctx, this.opacity));

    ctx.restore();
  }
}

// --- 频谱多边形精灵 ---
class PolygonSprite {
  x: number;
  y: number;
  sides: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number = 0.8;
  scale: number = 1.0;
  maxScale: number;
  thickness: number;

  constructor(width: number, height: number, sides: number, energy: number) {
    // 随机分布在中心区域（屏幕宽宽 40%~60% 之间随机，增加散度）
    const spreadX = width * 0.4;
    const spreadY = height * 0.4;
    this.x = (width / 2) + (Math.random() - 0.5) * spreadX;
    this.y = (height / 2) + (Math.random() - 0.5) * spreadY;

    this.sides = sides;
    this.radius = 20 + Math.random() * 30; // 基础半径
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.04;

    // 【核心改进】缩放比例与触发时的振幅强度挂钩
    // 基础倍率 1.2，加上振幅贡献（振幅通常在 0.01-0.2 之间，乘以系数使其具有冲击力）
    this.maxScale = 1.2 + energy * 10;

    this.thickness = 2 + Math.random() * 2;
  }

  update(dt: number) {
    this.scale += (this.maxScale - this.scale) * 0.05 * dt;
    this.opacity -= 0.012 * dt; // 降低消失速度，让肉眼能捕捉到节奏点
    this.rotation += this.rotationSpeed * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.opacity <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.scale(this.scale, this.scale);
    ctx.globalAlpha = Math.max(0, this.opacity);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = this.thickness / this.scale; // 保持视觉宽度一致

    ctx.beginPath();
    for (let i = 0; i < this.sides; i++) {
      const angle = (i * 2 * Math.PI) / this.sides;
      const px = this.radius * Math.cos(angle);
      const py = this.radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

const activeNodes = ref<LyricNode[]>([]);
const activePolygons = ref<PolygonSprite[]>([]);

// --- 节奏跟踪状态 (自适应包络 + 差分检测) ---
let smoothedEnergies = { low: 0, mid: 0, high: 0 };
let lastEnergies = { low: 0, mid: 0, high: 0 }; // 用于上升沿检测
let lastSpawnTimes = { low: 0, mid: 0, high: 0 };

const BEAT_COOLDOWN = 60;     // 降低冷却，捕捉双踩
const SMOOTH_FACTOR_FAST = 0.88; // 加快回落速度，应对高能转场

const initCanvas = () => {
  if (!lyricCanvasRef.value) return;
  const canvas = lyricCanvasRef.value;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
};

const renderLoop = (timestamp: number) => {
  if (!ctx || !lyricCanvasRef.value) return;

  // 【核心修复】增加容错，防止通过 renderLoop() 手动调用时 timestamp 为 undefined 导致 dt 为 NaN
  const safeTimestamp = timestamp || performance.now();
  const dt = (safeTimestamp - lastTimestamp) / 16.67;
  lastTimestamp = safeTimestamp;

  ctx.clearRect(0, 0, lyricCanvasRef.value.width, lyricCanvasRef.value.height);

  // --- [歌词渲染逻辑] ---
  if (playerStore.enableLyricsAnimation) {
    for (let i = activeNodes.value.length - 1; i >= 0; i--) {
      const node = activeNodes.value[i];
      // 离场节点不追踪词语（传 -1）；活跃节点直接用后端实时 wordIndex
      const wordIdx = node.isExiting ? -1 : playerStore.wordIndex;
      node.update(dt, wordIdx);
      node.draw(ctx);
      if (node.isExiting && node.opacity < 0.01) {
        activeNodes.value.splice(i, 1);
      }
    }
  }

  // --- [频谱渲染逻辑] 中心爆裂多边形 ---
  if (playerStore.enableSpectrum && playerStore.spectrumData.length > 0) {
    const data = playerStore.spectrumData;
    const canvas = lyricCanvasRef.value;

    // 1. 获取频段峰值 (比起均值更能体现打击感)
    const getPeak = (start: number, end: number) => {
      let max = 0;
      for (let i = start; i < end; i++) {
        if (data[i] > max) max = data[i];
      }
      return max;
    };

    const lowPeak = getPeak(0, 15);
    const midPeak = getPeak(15, 60);
    const highPeak = getPeak(60, 180);

    const now = performance.now();

    // 2. 自适应频率检测逻辑
    if (playerStore.isPlaying) {
      const checkBeat = (current: number, band: 'low' | 'mid' | 'high', minEnergy: number) => {
        // 1. 指数移动平均包络 (自适应背景)
        smoothedEnergies[band] = (smoothedEnergies[band] * SMOOTH_FACTOR_FAST) + (current * (1 - SMOOTH_FACTOR_FAST));

        // 2. 上升沿激发检测 (差分检测)
        const last = lastEnergies[band];
        const delta = current - last;
        const deltaThreshold = Math.max(minEnergy * 2, last * 0.4); 

        // 条件 A: 峰值比例检测
        const peakCondition = current > minEnergy && current > smoothedEnergies[band] * 1.3;
        // 条件 B: 能量暴涨检测 (Rising Edge)
        const deltaCondition = current > minEnergy && delta > deltaThreshold;

        let isBeat = false;
        if ((peakCondition || deltaCondition) && (now - lastSpawnTimes[band]) > BEAT_COOLDOWN) {
          lastSpawnTimes[band] = now;
          isBeat = true;
        }

        // 更新历史记录（关键：在返回前更新）
        lastEnergies[band] = current;
        return isBeat;
      };

      // 低频：底鼓/基调
      if (checkBeat(lowPeak, 'low', 0.005)) {
        activePolygons.value.push(new PolygonSprite(canvas.width, canvas.height, 3 + Math.floor(Math.random() * 2), lowPeak));
      }
      // 中频：军鼓/打击乐
      if (checkBeat(midPeak, 'mid', 0.004)) {
        activePolygons.value.push(new PolygonSprite(canvas.width, canvas.height, 5 + Math.floor(Math.random() * 2), midPeak));
      }
      // 高频：点缀/镲片
      if (checkBeat(highPeak, 'high', 0.003)) {
        activePolygons.value.push(new PolygonSprite(canvas.width, canvas.height, 8, highPeak * 1.2));
      }
    }

    // 3. 更新并绘制多边形
    for (let i = activePolygons.value.length - 1; i >= 0; i--) {
      const poly = activePolygons.value[i];
      poly.update(dt);
      poly.draw(ctx);
      if (poly.opacity <= 0) {
        activePolygons.value.splice(i, 1);
      }
    }
  }

  animationId = requestAnimationFrame(renderLoop);
};

// 监听歌词行变更（由后端 lyric_line_change 精准驱动），注入新粒子
watch(() => playerStore.currentLineIndex, (newIdx) => {
  if (!playerStore.enableLyricsAnimation || newIdx === -1) return;

  const lyricsLines = playerStore.currentTrack?.lyrics?.lines;
  if (!lyricsLines || !lyricsLines[newIdx]) return;

  const lineData = lyricsLines[newIdx];

  // 将之前的活跃节点标记为"准备离场"
  activeNodes.value.forEach(node => node.isExiting = true);

  // 用后端 lineProgress 计算行内已走过的时间，而非从头重播
  if (lyricCanvasRef.value && ctx) {
    const initialElapsed = playerStore.lineProgress * (lineData.duration || 0) * 1000;
    const newNode = new LyricNode(lineData, lyricCanvasRef.value.width, lyricCanvasRef.value.height, ctx, Math.max(0, initialElapsed));
    activeNodes.value.push(newNode);
  }
});

// 【核心重构】合并所有全屏状态监听器，确保逻辑顺序：初始化 -> 状态对齐 -> 启动循环 -> 计时器管理
watch(() => playerStore.isFullScreen, (isFull) => {
  if (isFull) {
    // 1. 重置闲置计时器
    resetIdleTimer();

    // 2. 延迟初始化画布（等待 DOM 过渡完成）
    setTimeout(() => {
      initCanvas();

      // 3. 立即提取并校准当前歌词行（仅当开启歌词动画时）
      const currentIdx = playerStore.currentLineIndex;
      const lyricsLines = playerStore.currentTrack?.lyrics?.lines;
      if (playerStore.enableLyricsAnimation && currentIdx >= 0 && lyricsLines && lyricsLines[currentIdx] && ctx && lyricCanvasRef.value) {
        const lineData = lyricsLines[currentIdx];
        // 用后端 lineProgress 计算行内偏移量，比本地时间差更精准
        const initialElapsed = playerStore.lineProgress * (lineData.duration || 0) * 1000;
        const node = new LyricNode(
          lineData,
          lyricCanvasRef.value.width,
          lyricCanvasRef.value.height,
          ctx,
          Math.max(0, initialElapsed)
        );
        activeNodes.value = [node];
      }

      // 4. 安全启动渲染主循环
      if (!animationId) {
        lastTimestamp = performance.now();
        animationId = requestAnimationFrame(renderLoop);
      }
    }, 150);
  } else {
    // 退出逻辑
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    activeNodes.value = [];
    activePolygons.value = [];
    isIdle.value = false;
    if (idleTimer) clearTimeout(idleTimer);
  }
});

// --- [修复] 画布初始化补丁：确保开关切换时画布能正确初始化 ---
watch(() => (playerStore.enableLyricsAnimation || playerStore.enableSpectrum), (val) => {
  // 当关闭歌词渲染时，立即清空现有歌词节点
  if (!playerStore.enableLyricsAnimation) {
    activeNodes.value = [];
  }

  if (val && playerStore.isFullScreen) {
    // 稍作延迟等待 DOM 渲染
    setTimeout(() => {
      initCanvas();
      if (!animationId) {
        lastTimestamp = performance.now();
        animationId = requestAnimationFrame(renderLoop);
      }
    }, 50);
  }
});

// --- 频谱可视化控制器 ---
watch([() => playerStore.isFullScreen, () => playerStore.enableSpectrum], ([isFull, isSpec]) => {
  // 只有在全屏且开启了频谱开关时，才向后端请求高频频谱推送
  playerStore.sendCommand({
    cmd: 'toggle_visualizer',
    active: !!(isFull && isSpec),
    hz: 60
  });
}, { immediate: true });

onMounted(() => {
  window.addEventListener('resize', initCanvas);
});

onUnmounted(() => {
  window.removeEventListener('resize', initCanvas);
  if (animationId) cancelAnimationFrame(animationId);
});
</script>

<template>
  <transition name="fade-screen">
    <div v-show="playerStore.isFullScreen" class="full-screen-player" @mousemove="handleMouseMove">
      <!-- 高斯模糊背景 -->
      <div class="bg-wrapper">
        <div class="bg-image"
          :style="playerStore.currentTrack.coverUrl ? `background-image: url(${playerStore.currentTrack.coverUrl})` : ''">
        </div>
        <div class="bg-overlay"></div>
      </div>

      <!-- [New] 动态艺术歌词/频谱画布层 -->
      <canvas v-show="playerStore.enableLyricsAnimation || playerStore.enableSpectrum" ref="lyricCanvasRef"
        class="lyrics-canvas"></canvas>

      <!-- 顶部条 -->
      <header class="top-bar" :class="{ 'is-hidden-top': isIdle }">
        <button class="icon-btn back-btn" @click="closeFullScreen">
          <IconArrowLeft />
        </button>
      </header>

      <!-- 底部功能容器 -->
      <footer class="bottom-container">
        <!-- 基础信息区：闲置时跟随下落 -->
        <div class="info-row" :class="{ 'info-idle': isIdle }">
          <div class="cover"
            :style="playerStore.currentTrack.coverUrl ? `background-image: url(${playerStore.currentTrack.coverUrl})` : ''">
          </div>
          <div class="texts">
            <div class="title">{{ playerStore.currentTrack.title }}</div>
            <div class="artist">{{ playerStore.currentTrack.artist || '未知歌手' }}</div>
          </div>
        </div>

        <!-- 将隐藏动画仅应用在控制栏组件上 -->
        <div class="controls-wrapper" :class="{ 'is-hidden-bottom': isIdle }">
          <div class="progress-row">
            <span class="time">{{ formatTime(playerStore.currentTime) }}</span>
            <div class="slider-wrapper">
              <GrooveSlider v-model="playerStore.currentTime" :max="playerStore.duration"
                @mousedown="playerStore.setDragging(true)"
                @change="(val: number) => { playerStore.setDragging(false); playerStore.seek(val); }" />
            </div>
            <span class="time">{{ formatTime(playerStore.duration) }}</span>
          </div>

          <div class="controls-row">
            <div class="left-action">
              <PlayerButton :icon="IconPrev" :icon-size="20" @click="playerStore.playPrev" />
              <div class="play-trigger">
                <PlayerButton :icon="playerStore.isPlaying ? IconPause : IconPlay" :size="48"
                  :icon-size="playerStore.isPlaying ? 20 : 22" :is-outline="false" @click="playerStore.togglePlay" />
              </div>
              <PlayerButton :icon="IconNext" :icon-size="20" @click="playerStore.playNext" />
              <PlayerButton :icon="IconShuffle" :active="playerStore.isShuffle" :icon-size="20"
                @click="playerStore.toggleShuffle()" />
              <PlayerButton :icon="IconRepeat" :active="playerStore.isRepeat" :icon-size="20"
                @click="playerStore.toggleRepeat()" />
              <div class="volume-control">
                <PlayerButton :icon="currentVolumeIcon" :icon-size="22" @click="playerStore.toggleMute" />
              </div>
              <PlayerButton :icon="IconMore" :icon-size="20" />
            </div>

            <div class="right-action">
              <PlayerButton :icon="IconPlaylist" :icon-size="22" />
              <PlayerButton :icon="IconLyrics" :icon-size="22" />
              <PlayerButton :icon="IconFullscreen" :icon-size="22" />
            </div>
          </div>

          <div class="bottom-arrow" @click="closeFullScreen">
            <IconArrowUp />
          </div>
        </div>
      </footer>
    </div>
  </transition>
</template>

<style scoped>
.full-screen-player {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 1000;
  color: #fff;
  background-color: #000;
  /* 添加纯黑底片，阻绝任何毛玻璃模糊后的半透明区域透穿到底层 */
  overflow: hidden;
  font-family: inherit;
}

/* 过渡动画 */
.fade-screen-enter-active,
.fade-screen-leave-active {
  transition: opacity 0.4s ease;
}

.fade-screen-enter-from,
.fade-screen-leave-to {
  opacity: 0;
}

/* 背景部分 */
.bg-wrapper {
  position: absolute;
  top: -5%;
  left: -5%;
  width: 110%;
  height: 110%;
  z-index: 0;
}

.lyrics-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 5;
  /* 位于背景之上，控件之下 */
  pointer-events: none;
  /* 不干扰点击 */
}

.bg-image {
  width: 100%;
  height: 100%;
  background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000');
  /* 示例专辑图片 */
  background-size: cover;
  background-position: center;
  filter: blur(40px);
  transform: scale(1.1);
}

.bg-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
}

/* 顶部：返回栏 */
.top-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  padding: 20px 24px;
  display: flex;
  justify-content: flex-start;
  z-index: 10;
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease;
}

.icon-btn {
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  font-size: 26px;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.icon-btn:hover {
  opacity: 1;
}

.is-hidden-top {
  transform: translateY(-100%);
  opacity: 0;
}

/* 底部功能区 */
.bottom-container {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 0 40px 10px 40px;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

.controls-wrapper {
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease;
}

.is-hidden-bottom {
  transform: translateY(115px);
  /* 保持与上面相同的下降绝对像素值，从而速度同步 */
  opacity: 0;
  pointer-events: none;
}

/* 第一行：歌曲信息 */
.info-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
}

.info-idle {
  transform: translateY(115px);
  /* 下方进度条和按钮区的大致高度，使其落在底部 */
}

.cover {
  width: 80px;
  height: 80px;
  background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000');
  /* 示例专辑图片 */
  background-size: cover;
  background-position: center;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.texts {
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 6px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.artist {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 500;
}

/* 第二行：进度条 */
.progress-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.slider-wrapper {
  flex: 1;
}

.time {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  width: 40px;
  text-align: center;
}

/* 第三行：控制行 */
.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.left-action {
  display: flex;
  align-items: center;
  gap: 20px;
}

.right-action {
  display: flex;
  align-items: center;
  gap: 24px;
}

.play-trigger {
  margin: 0 8px;
}

.volume-control {
  margin-left: 12px;
}

/* 第四行：底部的向上箭头 */
.bottom-arrow {
  display: flex;
  justify-content: center;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: color 0.2s;
  padding-bottom: 10px;
}

.bottom-arrow:hover {
  color: #fff;
}
</style>
