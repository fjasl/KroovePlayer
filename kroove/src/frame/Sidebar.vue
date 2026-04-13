<!-- src/frame/Sidebar.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import SidebarItem from '../component/SidebarItem.vue';
import SidebarSearch from '../component/SidebarSearch.vue';

// 图标组件
import IconNote from '../assets/icons/IconNote.vue';
import IconHistory from '../assets/icons/IconHistory.vue';
import IconPlaying from '../assets/icons/IconPlaying.vue';
import IconSettings from '../assets/icons/IconSettings.vue';
import IconMenu from '../assets/icons/IconMenu.vue';

const isExpanded = ref(false);

const props = defineProps<{ activeId?: string }>();
const emit = defineEmits<{ (e: 'update:activeId', id: string): void }>();

const menuItems = [
  { id: 'home', icon: IconNote, label: '我的音乐' },
  { id: 'recent', icon: IconHistory, label: '最近播放内容' },
  { id: 'playing', icon: IconPlaying, label: '正在播放' },
];

const toggle = () => (isExpanded.value = !isExpanded.value);
const select = (id: string) => emit('update:activeId', id);
</script>

<template>
  <aside class="sidebar" :class="{ 'is-expanded': isExpanded }">
    <!-- 汉堡按钮：自成首部占位 -->
    <div class="hamburger-container" @click="toggle">
      <div class="icon-box">
        <IconMenu />
      </div>
    </div>

    <!-- 搜索栏组件：通过内部视觉边距处理形态 -->
    <SidebarSearch 
      :is-expanded="isExpanded" 
      @toggle-sidebar="toggle"
    />

    <!-- 导航菜单：与上方无缝衔接 -->
    <nav class="nav-links">
      <SidebarItem 
        v-for="item in menuItems" 
        :key="item.id"
        :icon="item.icon"
        :label="item.label"
        :is-active="activeId === item.id"
        @click="select(item.id)"
      />
    </nav>

    <!-- 底部功能按钮 -->
    <footer class="sidebar-footer">
      <SidebarItem 
        :icon="IconSettings" 
        label="设置" 
        :is-active="activeId === 'settings'"
        @click="select('settings')"
      />
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  position: absolute;
  top: 0;
  left: 0;
  height: calc(100vh - 80px);
  width: 48px;
  background: rgba(25, 25, 25, 0.9);
  backdrop-filter: blur(30px);
  z-index: 100;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  color: white;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  
  display: flex;
  flex-direction: column;
}

.sidebar.is-expanded {
  width: 280px;
  box-shadow: 10px 0 40px rgba(0, 0, 0, 0.6);
}

.hamburger-container {
  height: 48px;
  width: 48px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.hamburger-container:hover {
  background: rgba(255, 255, 255, 0.08);
}

.icon-box {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-links {
  margin-top: 0; /* 修正：移除缝隙，形成连续侧边条 */
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-footer {
  margin-top: auto;
}

/* 穿透控制子组件的文字显示 */
.sidebar.is-expanded :deep(.label) { 
  opacity: 1; 
}

.label { 
  opacity: 0; 
  transition: opacity 0.2s;
}
</style>
