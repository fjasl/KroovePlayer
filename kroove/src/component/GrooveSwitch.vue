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
  border: 2px solid var(--border-color);
  position: relative;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

/* 浅色模式下的关闭状态：深色边框 */
.theme-light .groove-switch:not(.is-on) {
  border-color: #333333;
  background: #ffffff;
}

.groove-switch.is-on {
  background: #0078d4;
  border-color: #0078d4;
}

.groove-switch-handle {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-secondary);
  position: absolute;
  top: 3px;
  left: 4px;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

/* 浅色模式下的拇指颜色逻辑 */
.theme-light .groove-switch-handle {
  background: #333333; /* 未打开是深色的 */
}

.groove-switch.is-on .groove-switch-handle {
  background: #ffffff; /* 打开了是白色的 */
  left: 24px;
}

.groove-switch-wrapper:hover .groove-switch:not(.is-on) {
  border-color: var(--text-primary);
}
.groove-switch-label {
  color: var(--text-primary);
  font-size: 14px;
  user-select: none;
}
</style>
