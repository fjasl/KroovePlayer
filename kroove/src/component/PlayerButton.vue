<!-- src/component/PlayerButton.vue -->
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  icon: any;
  active?: boolean;         // 是否处于激活状态 (例如：随机播放开启)
  size?: number;           // 按钮容器大小
  iconSize?: number;       // 图标大小
  isOutline?: boolean;     // 是否带有永久细边框 (播放键常用)
}>();

const buttonSize = computed(() => props.size || 40);
const svgSize = computed(() => props.iconSize || 18);
</script>

<template>
  <div 
    class="player-button" 
    :class="{ 'is-active': active, 'is-outline': isOutline }"
    :style="{ width: buttonSize + 'px', height: buttonSize + 'px' }"
  >
    <div class="icon-wrapper" :style="{ width: svgSize + 'px', height: svgSize + 'px' }">
      <component :is="icon" />
    </div>
  </div>
</template>

<style scoped>
.player-button {
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: #ccc;
  user-select: none;
}

/* 默认悬浮：淡淡的圆形背景 */
.player-button:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

/* 激活状态：深灰/浅灰圆形背景，模仿截图效果 */
.is-active {
  background: rgba(255, 255, 255, 0.15) !important;
  color: #fff !important;
}

/* 播放按钮特有的细边框样式 */
.is-outline {
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.is-outline:hover {
  border-color: #fff;
  transform: scale(1.05); /* 播放键悬浮时轻微放大 */
}

.icon-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
