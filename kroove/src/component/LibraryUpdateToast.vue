<template>
  <Transition name="toast">
    <div v-if="isVisible" class="library-toast">
      <div class="toast-content">
        <!-- 核心状态图标 -->
        <div class="icon-section">
          <IconRepeatSync class="icon-sync rotating" />
        </div>

        <div class="text-info">
          <div class="title">{{ displayTitle }}</div>
          <div class="subtitle">
            <Transition name="fade" mode="out-in">
              <span :key="playerStore.scanLastFile || playerStore.scanCount">
                {{ displaySubtitle }}
              </span>
            </Transition>
          </div>
        </div>

        <!-- 关闭按钮 -->
        <button class="btn-close" @click="handleManualClose">
          <IconClose />
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { usePlayerStore } from '../stores/player';
import IconRepeatSync from '../assets/icons/IconRepeatSync.vue';
import IconClose from '../assets/icons/IconClose.vue';

const playerStore = usePlayerStore();
const isUserClosed = ref(false);

const isVisible = computed(() => {
  return playerStore.scanActive && !isUserClosed.value;
});

const displayTitle = computed(() => {
  switch (playerStore.scanType) {
    case 'remove': return '正在移除曲目';
    case 'update': return '正在同步资源';
    case 'add': 
    default: return '正在添加曲目';
  }
});

const displaySubtitle = computed(() => {
  return `${playerStore.scanCount} 首曲目`;
});

watch(() => playerStore.scanActive, (newVal) => {
  if (newVal) isUserClosed.value = false;
});

const handleManualClose = () => {
  isUserClosed.value = true;
};
</script>

<style scoped>
.library-toast {
  position: absolute;
  top: 24px; 
  right: 24px;
  
  /* 统一背景色：使用标准 Windows 蓝 */
  background: #0078d4; 
  color: white;
  min-width: 320px;
  padding: 12px 16px;
  border-radius: 0;
  

  z-index: 2000;
  border: none;
  
  /* 确保没有任何左侧边距溢出或残留 */
  display: flex;
  align-items: center;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.icon-section {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: transparent; /* 强制透明，防止色差 */
}

.icon-sync {
  width: 18px;
  height: 18px;
}

.rotating {
  animation: rotate 2s linear infinite;
}

.text-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 14px;
  font-weight: 400;
  margin: 0;
}

.subtitle {
  font-size: 12px;
  opacity: 0.85;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-close {
  background: transparent;
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  cursor: pointer;
  padding: 4px;
  opacity: 0.7;
  transition: opacity 0.2;
}

.btn-close:hover {
  opacity: 1;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 进场动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
