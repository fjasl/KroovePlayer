<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toggle = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div class="groove-switch-wrapper" @click="toggle">
    <div class="groove-switch" :class="{ 'is-on': modelValue }">
      <div class="groove-switch-handle"></div>
    </div>
    <span class="groove-switch-label">{{ modelValue ? '开' : '关' }}</span>
  </div>
</template>

<style scoped>
.groove-switch-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  width: fit-content;
}
.groove-switch {
  width: 44px;
  height: 22px;
  border-radius: 11px;
  border: 2px solid #ccc;
  position: relative;
  transition: all 0.2s ease;
  box-sizing: border-box;
}
.groove-switch.is-on {
  background: #0078d4;
  border-color: #0078d4;
}
.groove-switch-handle {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ccc;
  position: absolute;
  top: 3px;
  left: 4px;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.groove-switch.is-on .groove-switch-handle {
  background: #000; /* Windows Groove 打开状态圆点往往是黑色的，或者白色，截图中是白色 */
  left: 24px;
}
/* 以暗色主题为例，实心圆点通常是白色，背景蓝 */
.groove-switch.is-on .groove-switch-handle {
  background: #fff;
}

.groove-switch-wrapper:hover .groove-switch:not(.is-on) {
  border-color: #fff;
}
.groove-switch-wrapper:hover .groove-switch:not(.is-on) .groove-switch-handle {
  background: #fff;
}
.groove-switch-label {
  color: #fff;
  font-size: 14px;
  user-select: none;
}
</style>
