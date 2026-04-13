<!-- src/component/SidebarItem.vue -->
<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  // 接收一个 Vue 组件作为图标
  icon?: Component | null;
  label: string;
  isActive?: boolean;
}>();
</script>

<template>
  <div class="nav-item" :class="{ active: isActive }">
    <div class="icon-container">
      <!-- 优先使用通过 Props 传入的组件 -->
      <component v-if="icon" :is="icon" class="nav-icon" />
      <!-- 如果没有组件，则通过插槽提供默认图标 -->
      <slot v-else name="icon"></slot>
    </div>
    <span class="label">{{ label }}</span>
  </div>
</template>

<style scoped>
.nav-item {
  height: 48px;
  display: flex;
  align-items: center;
  cursor: pointer;
  white-space: nowrap;
  color: #ccc;
  transition: all 0.2s ease-in-out;
  position: relative;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: #0078d4;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.icon-container {
  width: 48px;
  height: 48px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.nav-icon {
  width: 18px;
  height: 18px;
  color: inherit;
}

.label {
  font-size: 13.5px;
  letter-spacing: 0.1px;
}
</style>
