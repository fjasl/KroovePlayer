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
    <div 
      v-show="playerStore.isFullScreen" 
      class="full-screen-player"
      @mousemove="handleMouseMove"
    >
      <!-- 高斯模糊背景 -->
      <div class="bg-wrapper">
        <div class="bg-image" :style="playerStore.currentTrack.coverUrl ? `background-image: url(${playerStore.currentTrack.coverUrl})` : ''"></div>
        <div class="bg-overlay"></div>
      </div>

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
          <div class="cover" :style="playerStore.currentTrack.coverUrl ? `background-image: url(${playerStore.currentTrack.coverUrl})` : ''">
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
              <GrooveSlider 
                v-model="playerStore.currentTime" 
                :max="playerStore.duration" 
                @mousedown="playerStore.setDragging(true)"
                @change="(val: number) => { playerStore.setDragging(false); playerStore.seek(val); }"
              />
            </div>
            <span class="time">{{ formatTime(playerStore.duration) }}</span>
          </div>

        <div class="controls-row">
          <div class="left-action">
            <PlayerButton :icon="IconPrev" :icon-size="20" @click="playerStore.playPrev" />
            <div class="play-trigger">
              <PlayerButton 
                :icon="playerStore.isPlaying ? IconPause : IconPlay" 
                :size="48" 
                :icon-size="playerStore.isPlaying ? 20 : 22"
                :is-outline="false" 
                @click="playerStore.togglePlay"
              />
            </div>
            <PlayerButton :icon="IconNext" :icon-size="20" @click="playerStore.playNext" />
            <PlayerButton 
              :icon="IconShuffle" 
              :active="playerStore.isShuffle" 
              :icon-size="20"
              @click="playerStore.toggleShuffle()" 
            />
            <PlayerButton 
              :icon="IconRepeat" 
              :active="playerStore.isRepeat" 
              :icon-size="20"
              @click="playerStore.toggleRepeat()" 
            />
            <div class="volume-control">
              <PlayerButton 
                :icon="currentVolumeIcon" 
                :icon-size="22" 
                @click="playerStore.toggleMute"
              />
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
  background-color: #000; /* 添加纯黑底片，阻绝任何毛玻璃模糊后的半透明区域透穿到底层 */
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

.bg-image {
  width: 100%;
  height: 100%;
  background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000'); /* 示例专辑图片 */
  background-size: cover;
  background-position: center;
  filter: blur(80px);
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
  transform: translateY(115px); /* 保持与上面相同的下降绝对像素值，从而速度同步 */
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
  transform: translateY(115px); /* 下方进度条和按钮区的大致高度，使其落在底部 */
}

.cover {
  width: 80px;
  height: 80px;
  background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000'); /* 示例专辑图片 */
  background-size: cover;
  background-position: center;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.texts {
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 6px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
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
