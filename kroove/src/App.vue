<!-- src/App.vue -->
<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import Sidebar from './frame/Sidebar.vue'
import MainContent from './frame/MainContent.vue'
import PlayerBar from './frame/PlayerBar.vue'
import FullScreenPlayer from './frame/FullScreenPlayer.vue'
import LibraryUpdateToast from './component/LibraryUpdateToast.vue'

import { usePlayerStore } from './stores/player'

const currentSidebarId = ref('home')
const playerStore = usePlayerStore()

// 系统主题检测
const systemTheme = ref<'light' | 'dark'>('dark')
const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')

const updateSystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
  systemTheme.value = e.matches ? 'light' : 'dark'
}

onMounted(() => {
  playerStore.initConnection()
  updateSystemTheme(mediaQuery)
  mediaQuery.addEventListener('change', updateSystemTheme)
})

onUnmounted(() => {
  mediaQuery.removeEventListener('change', updateSystemTheme)
})

// 计算最终应用到根节点的类
const themeClass = computed(() => {
  if (playerStore.themeMode === 'system') {
    return `theme-${systemTheme.value}`
  }
  return `theme-${playerStore.themeMode}`
})
</script>

<template>
  <div class="app-shell" :class="themeClass">
    <div class="top-layout">
      <!-- 侧边栏预留底座 (48px) -->
      <div class="sidebar-rail">
        <Sidebar :active-id="currentSidebarId" @update:active-id="currentSidebarId = $event" />
      </div>
      <!-- 主内容区 -->
      <MainContent :active-sidebar="currentSidebarId" />
    </div>
    <!-- 底部播放栏 -->
    <PlayerBar />

    <LibraryUpdateToast />

    <!-- 全屏播放页 -->
    <FullScreenPlayer />
  </div>
</template>

<style>
/* 主题变量定义 */
.theme-dark {
  --bg-main: #000000;
  --bg-sidebar: rgba(25, 25, 25, 0.9);
  --bg-playerbar: #1c1c1f;
  --bg-header: #000000;
  --text-primary: #ffffff;
  --text-secondary: #aaaaaa;
  --border-color: rgba(255, 255, 255, 0.08);
  --hover-bg: rgba(255, 255, 255, 0.1);
  --scrollbar-thumb: rgba(255, 255, 255, 0.3);
  --scrollbar-track-hover: #1c1c1c;
}

.theme-light {
  --bg-main: #ffffff;
  --bg-sidebar: rgba(243, 243, 243, 0.9);
  --bg-playerbar: #1c1c1f; /* 保持深色，以支持氛围采色 */
  --bg-header: #ffffff;
  --text-primary: #111111;
  --text-secondary: #666666;
  --border-color: rgba(0, 0, 0, 0.1);
  --hover-bg: rgba(0, 0, 0, 0.06);
  --scrollbar-thumb: rgba(0, 0, 0, 0.3);
  --scrollbar-track-hover: #e5e5e5;
}

/* 重置全局样式 */
* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
body { background: var(--bg-main); overflow: hidden; color: var(--text-primary); transition: background 0.3s ease, color 0.3s ease; }

.app-shell {
  display: grid;
  grid-template-rows: 1fr 80px; 
  height: 100vh;
  width: 100vw;
  background: var(--bg-main);
  color: var(--text-primary);
}

.top-layout {
  display: flex;
  overflow: hidden;
  position: relative;
}

.sidebar-rail {
  width: 48px;
  flex-shrink: 0;
  position: relative;
}

/* ========== UWP 风格的全局滚动条定制 ========== */
::-webkit-scrollbar {
  width: 14px;
  height: 14px;
  background-color: transparent;
}

::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

::-webkit-scrollbar-track {
  background-color: transparent;
}

::-webkit-scrollbar-track:hover {
  background-color: var(--scrollbar-track-hover);
}

::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb);
  border: 4px solid transparent; 
  background-clip: content-box;
  border-radius: 99px;
  min-height: 40px;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--text-secondary);
  border: 1px solid transparent;
  border-radius: 0; 
}

::-webkit-scrollbar-thumb:active {
  background-color: var(--text-primary);
  border: 1px solid transparent;
  border-radius: 0;
}
</style>
