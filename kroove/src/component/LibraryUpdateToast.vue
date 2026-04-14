<template>
  <Transition name="toast">
    <div v-if="isVisible" class="library-toast">
      <div class="toast-content">
        <!-- 扫描图标 (旋转动画) -->
        <div class="icon-sync">
          <IconRepeatSync class="rotating" />
        </div>

        <div class="text-info">
          <div class="title">正在添加音乐</div>
          <div class="subtitle">{{ playerStore.scanCount }} 首歌曲</div>
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

// 当扫描重启时，重置用户关闭状态
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
  background: #004a87; /* 蓝调背景 */
  color: white;
  min-width: 280px;
  padding: 14px 18px;
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  border-left: 4px solid #0078d4;
  backdrop-filter: blur(10px);
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}

.icon-sync {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  opacity: 0.9;
}

.rotating {
  animation: rotate 2s linear infinite;
}

.text-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.subtitle {
  font-size: 12px;
  opacity: 0.8;
}

.btn-close {
  position: absolute;
  right: -6px;
  top: 0px;
  background: transparent;
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-close:hover {
  opacity: 1;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 动画过度 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.9);
}
</style>
