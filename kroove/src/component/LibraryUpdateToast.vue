<template>
  <div class="notification-container">
    <TransitionGroup name="list">
      <div 
        v-for="item in playerStore.notifications" 
        :key="item.id" 
        class="library-toast"
      >
        <div class="toast-content">
          <div class="icon-section">
            <IconRepeatSync class="icon-sync rotating" />
          </div>

          <div class="text-info">
            <div class="title">{{ item.title }}</div>
            <div class="subtitle">
              <span>{{ item.message }}</span>
            </div>
          </div>

          <button class="btn-close" @click="handleManualClose(item.id)">
            <IconClose />
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '../stores/player';
import IconRepeatSync from '../assets/icons/IconRepeatSync.vue';
import IconClose from '../assets/icons/IconClose.vue';

const playerStore = usePlayerStore();

const handleManualClose = (id: string) => {
  playerStore.notifications = playerStore.notifications.filter(n => n.id !== id);
};
</script>

<style scoped>
.notification-container {
  position: absolute;
  top: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 2000;
  pointer-events: none; /* 容器穿透，但子元素开启 */
}

.library-toast {
  pointer-events: auto;
  /* 统一背景色：使用标准 Windows 蓝 */
  background: #0078d4; 
  color: white;
  min-width: 320px;
  padding: 12px 16px;
  border-radius: 0;
 
  
  display: flex;
  align-items: center;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
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
  font-weight: 600;
  margin: 0;
}

.subtitle {
  font-size: 12px;
  opacity: 0.9;
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

/* 列表动画 (TransitionGroup) */
.list-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.list-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.list-leave-active {
  position: absolute; /* 离开时脱离文档流，让下面的平滑滑上来 */
  width: 100%;
}
</style>
