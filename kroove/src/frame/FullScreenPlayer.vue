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
      // 组装过程：带 Stagger 延迟的指数衰减
      const assemblyElapsed = Math.max(0, elapsed - this.assemblyDelay);
      const factor = 1 - Math.exp(-assemblyElapsed / 450);
      this.currentX = this.originX + (this.targetRelX - this.originX) * factor;
      this.currentY = this.originY + (this.targetRelY - this.originY) * factor;
      this.opacity = factor;
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
  
  entranceStyle: EntranceStyle;
  exitStyle: ExitStyle;
  elapsed: number = 0;

  constructor(lineData: any, canvasWidth: number, canvasHeight: number, tempCtx: CanvasRenderingContext2D) {
    this.text = lineData.text;
    this.startTime = performance.now();
    this.fontSize = 32 + Math.random() * 8;
    
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
  }

  update(dt: number) {
    this.elapsed = performance.now() - this.startTime;

    // 基础透明度渐入
    this.opacity += (1 - this.opacity) * 0.1;

    // 驱动所有子级散点
    this.words.forEach(w => {
      // 如果还没到该词的出场时间，检查是否应激活
      if (!w.isActivated && this.elapsed >= w.start) {
        w.isActivated = true;
      }
      w.update(dt, this.isExiting, this.exitStyle);
    });
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

    // 委派给每个词自己的绘制逻辑
    this.words.forEach(w => w.draw(ctx, this.opacity));
    
    ctx.restore();
  }
}

const activeNodes = ref<LyricNode[]>([]);

const initCanvas = () => {
  if (!lyricCanvasRef.value) return;
  const canvas = lyricCanvasRef.value;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
};

const renderLoop = (timestamp: number) => {
  if (!ctx || !lyricCanvasRef.value) return;
  
  const dt = (timestamp - lastTimestamp) / 16.67; // 标准化 dt (假设 60fps 为 1)
  lastTimestamp = timestamp;

  ctx.clearRect(0, 0, lyricCanvasRef.value.width, lyricCanvasRef.value.height);

  for (let i = activeNodes.value.length - 1; i >= 0; i--) {
    const node = activeNodes.value[i];
    node.update(dt);
    node.draw(ctx);
    if (node.isExiting && node.opacity < 0.01) {
      activeNodes.value.splice(i, 1);
    }
  }
  animationId = requestAnimationFrame(renderLoop);
};

// 监听歌词行变更，注入新粒子
watch(() => playerStore.currentLineIndex, (newIdx) => {
  if (!playerStore.enableLyricsAnimation || newIdx === -1) return;
  
  const lyricsLines = playerStore.currentTrack?.lyrics?.lines;
  if (!lyricsLines || !lyricsLines[newIdx]) return;

  const lineData = lyricsLines[newIdx];

  // 将之前的活跃节点标记为“准备离场”
  activeNodes.value.forEach(node => node.isExiting = true);

  // 创建新节点
  if (lyricCanvasRef.value && ctx) {
    const newNode = new LyricNode(lineData, lyricCanvasRef.value.width, lyricCanvasRef.value.height, ctx);
    activeNodes.value.push(newNode);
  }
});

watch(() => playerStore.isFullScreen, (isFull) => {
  if (isFull) {
    setTimeout(() => {
        initCanvas();
        if (!animationId) renderLoop();
    }, 100);
  } else {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    activeNodes.value = [];
  }
});

onMounted(() => {
  window.addEventListener('resize', initCanvas);
});

onUnmounted(() => {
  window.removeEventListener('resize', initCanvas);
  if (animationId) cancelAnimationFrame(animationId);
});

watch(() => playerStore.isFullScreen, (newVal) => {
  if (newVal) {
    resetIdleTimer();
  } else {
    isIdle.value = false;
    if (idleTimer) clearTimeout(idleTimer);
  }
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

      <!-- [New] 动态艺术歌词画布层 -->
      <canvas v-if="playerStore.enableLyricsAnimation" ref="lyricCanvasRef" class="lyrics-canvas"></canvas>

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
  z-index: 5; /* 位于背景之上，控件之下 */
  pointer-events: none; /* 不干扰点击 */
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
