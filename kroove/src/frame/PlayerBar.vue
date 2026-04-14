<!-- src/frame/PlayerBar.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePlayerStore } from '../stores/player';
import PlayerButton from '../component/PlayerButton.vue';
import GrooveSlider from '../component/GrooveSlider.vue';

// 引入图标组件
import IconShuffle from '../assets/icons/IconShuffle.vue';
import IconRepeat from '../assets/icons/IconRepeat.vue';
import IconPrev from '../assets/icons/IconPrev.vue';
import IconNext from '../assets/icons/IconNext.vue';
import IconPlay from '../assets/icons/IconPlay.vue';
import IconPause from '../assets/icons/IconPause.vue';
import IconMiniPlayer from '../assets/icons/IconMiniPlayer.vue';
import IconMore from '../assets/icons/IconMore.vue';

// 引入音量状态图标
import IconVolumeMute from '../assets/icons/IconVolumeMute.vue';
import IconVolume0 from '../assets/icons/IconVolume0.vue';
import IconVolume1 from '../assets/icons/IconVolume1.vue';
import IconVolume2 from '../assets/icons/IconVolume2.vue';

const playerStore = usePlayerStore();
const sampledColor = ref('rgb(37, 37, 40)'); // 默认深灰

const extractColor = (url: string) => {
  if (!url) {
    sampledColor.value = 'rgb(37, 37, 40)';
    return;
  }
  
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = 10; // 极小采样，只为获取氛围色
    canvas.height = 10;
    ctx.drawImage(img, 0, 0, 10, 10);
    
    const data = ctx.getImageData(0, 0, 10, 10).data;
    let r = 0, g = 0, b = 0;
    
    // 简单加权平均：提取氛围
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    
    const count = data.length / 4;
    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);

    // 视觉修正：适当调低亮度与饱和度，确保文字清晰度
    // 使用简单的模拟 HSL 调整
    const darken = 0.6; // 60% 亮度
    sampledColor.value = `rgb(${Math.floor(r * darken)}, ${Math.floor(g * darken)}, ${Math.floor(b * darken)})`;
  };
  img.src = url;
};

// 监听封面变化
watch(() => playerStore.currentTrack.coverUrl, (newUrl) => {
  extractColor(newUrl);
}, { immediate: true });

const handleInfoClick = () => {
  playerStore.toggleFullScreen();
};

// 时间格式化
const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// 计算当前应显示的音量图标
const currentVolumeIcon = computed(() => {
  if (playerStore.isMuted) return IconVolumeMute;
  if (playerStore.volume === 0) return IconVolume0;
  if (playerStore.volume < 60) return IconVolume1;
  return IconVolume2;
});
</script>

<template>
  <footer class="player-bar" :style="{ background: sampledColor }">
    <!-- 左侧：歌曲信息区 -->
    <div class="info-section" @click="handleInfoClick">
      <div class="album-art">
        <div class="placeholder-art" :style="playerStore.currentTrack.coverUrl ? `background-image: url(${playerStore.currentTrack.coverUrl})` : ''"></div>
      </div>
      <div class="metadata">
        <div class="song-name">{{ playerStore.currentTrack.title }}</div>
        <div class="artist">{{ playerStore.currentTrack.artist || '未知歌手' }}</div>
      </div>
    </div>

    <!-- 中间：核心播放控制 -->
    <div class="controls-section">
      <div class="main-buttons">
        <PlayerButton 
          :icon="IconShuffle" 
          :active="playerStore.isShuffle" 
          :icon-size="16"
          @click="playerStore.toggleShuffle()" 
        />
        
        <PlayerButton :icon="IconPrev" :icon-size="16" @click="playerStore.playPrev" />

        <div class="play-trigger">
          <PlayerButton 
            :icon="playerStore.isPlaying ? IconPause : IconPlay" 
            :size="42" 
            :icon-size="playerStore.isPlaying ? 16 : 18"
            :is-outline="true" 
            @click="playerStore.togglePlay"
          />
        </div>

        <PlayerButton :icon="IconNext" :icon-size="16" @click="playerStore.playNext" />

        <PlayerButton 
          :icon="IconRepeat" 
          :active="playerStore.isRepeat" 
          :icon-size="16"
          @click="playerStore.toggleRepeat()" 
        />
      </div>
      
      <!-- 播放进度条 -->
      <div class="progress-container">
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
    </div>

    <!-- 右侧：音量与额外功能 -->
    <div class="options-section">
      <div class="volume-control">
        <PlayerButton 
          :icon="currentVolumeIcon" 
          :icon-size="18" 
          @click="playerStore.toggleMute"
        />
        <div class="volume-slider-wrapper">
          <GrooveSlider 
            v-model="playerStore.volume" 
            :max="100" 
            @change="(val: number) => playerStore.setVolume(val)"
          />
        </div>
      </div>

      <div class="extra-actions">
        <PlayerButton :icon="IconMiniPlayer" :icon-size="18" />
        <PlayerButton :icon="IconMore" :icon-size="18" />
      </div>
    </div>
  </footer>
</template>

<style scoped>
.player-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: #252528;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  z-index: 200;
  overflow: hidden;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 1.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.info-section {
  display: flex;
  align-items: center;
  height: 80px;
  min-width: 240px;
  cursor: pointer;
  transition: background 0.2s;
}

.info-section:hover {
  background: rgba(255, 255, 255, 0.05);
}

.album-art {
  width: 80px;
  height: 80px;
  background: #333;
  flex-shrink: 0;
}

.placeholder-art {
  width: 100%;
  height: 100%;
  background-image: url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000');
  background-size: cover;
  background-position: center;
}

.metadata {
  padding-left: 14px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  padding-right: 16px;
}

.song-name {
  font-size: 15px;
  font-weight: 400;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.artist {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.controls-section {
  flex: 1;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0 20px;
}

.main-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.play-trigger {
  margin: 0 8px;
}

.progress-container {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 12px;
}

.slider-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
}

.time {
  font-size: 11px;
  color: #aaa;
  width: 32px;
  text-align: center;
}

.options-section {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 380px;
  gap: 16px;
  padding-right: 12px;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 160px;
}

.volume-slider-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
}

.extra-actions {
  display: flex;
  gap: 4px;
}
</style>
