<!-- src/component/GrooveSlider.vue -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
}>();

const emit = defineEmits(['update:modelValue', 'change']);

const isDragging = ref(false);
const isHovered = ref(false);
const sliderRef = ref<HTMLElement | null>(null);

const minValue = computed(() => props.min ?? 0);
const maxValue = computed(() => props.max ?? 100);

// 计算百分比 (0-100)
const percentage = computed(() => {
  const range = maxValue.value - minValue.value;
  if (range === 0) return 0;
  const percent = ((props.modelValue - minValue.value) / range) * 100;
  return Math.min(100, Math.max(0, percent));
});

// 处理位置更新
const updateValue = (clientX: number) => {
  if (!sliderRef.value) return;
  const rect = sliderRef.value.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const percent = Math.min(1, Math.max(0, offsetX / rect.width));
  const newValue = minValue.value + (maxValue.value - minValue.value) * percent;
  emit('update:modelValue', newValue);
};

// 拖拽相关事件
const onMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  updateValue(e.clientX);
  
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e: MouseEvent) => {
  if (isDragging.value) {
    updateValue(e.clientX);
  }
};

const onMouseUp = () => {
  if (isDragging.value) {
    isDragging.value = false;
    emit('change', props.modelValue);
  }
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
};

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div 
    class="groove-slider" 
    ref="sliderRef"
    @mousedown="onMouseDown"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- 底轨 -->
    <div class="slider-rail">
      <!-- 填充轨 (带间隙计算) -->
      <div 
        class="slider-fill" 
        :style="{ width: `calc(${percentage}% - 10px)` }"
      ></div>
      
      <!-- 未播轨 (从滑块后开始) -->
      <div 
        class="slider-empty" 
        :style="{ left: `calc(${percentage}% + 10px)`, width: `calc(${100 - percentage}% - 10px)` }"
      ></div>
      
      <!-- 滑块 (Handle) -->
      <div 
        class="slider-thumb"
        :class="{ 'is-dragging': isDragging }"
        :style="{ left: percentage + '%' }"
      >
        <div class="thumb-core"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.groove-slider {
  position: relative;
  width: 100%;
  height: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.slider-rail {
  position: relative;
  width: 100%;
  height: 2px;
  background: transparent; /* 基座透明，由填充分段控制 */
}

.slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: #fff;
  border-radius: 1px;
}

.slider-empty {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 1px;
}

.slider-thumb {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  opacity: 1; /* 始终可见 */
}

.thumb-core {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid white;
  background: transparent;
  box-sizing: border-box;
  transition: background 0.1s, transform 0.1s;
}

.is-dragging .thumb-core {
  background: white;
  border: none;
  transform: scale(1.1);
}

.groove-slider:hover .thumb-core {
  transform: scale(1.1);
}
</style>
