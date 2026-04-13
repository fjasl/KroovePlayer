<!-- src/App.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Sidebar from './frame/Sidebar.vue'
import MainContent from './frame/MainContent.vue'
import PlayerBar from './frame/PlayerBar.vue'
import FullScreenPlayer from './frame/FullScreenPlayer.vue'

import { usePlayerStore } from './stores/player'

const currentSidebarId = ref('home')
const playerStore = usePlayerStore()

onMounted(() => {
  playerStore.initConnection()
})
</script>

<template>
  <div class="app-shell">
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

    <!-- 全屏播放页 -->
    <FullScreenPlayer />
  </div>
</template>

<style>
/* 重置全局样式 */
* { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
body { background: black; overflow: hidden; }

.app-shell {
  display: grid;
  grid-template-rows: 1fr 80px; /* 上部 1 份，底部 80px */
  height: 100vh;
  width: 100vw;
}

.top-layout {
  display: flex; /* 使用 flex 让主内容占满剩余宽度 */
  overflow: hidden;
  position: relative;
}

.sidebar-rail {
  width: 48px; /* 这个宽度决定了右侧内容从哪里开始 */
  flex-shrink: 0;
  position: relative;
}

/* ========== UWP 风格的全局滚动条定制 ========== */

/* 整体容器：预留较宽的空间以捕捉鼠标 hover */
::-webkit-scrollbar {
  width: 14px;
  height: 14px;
  background-color: transparent;
}

/* 直接隐藏所有滚动条两端的上下步进按键（现代 Fluent Design 多数已经摒弃） */
::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

/* 轨道默认透明 */
::-webkit-scrollbar-track {
  background-color: transparent;
}

/* 只有鼠标直接放在轨道上时，背景轨道才变实心深灰（匹配图2） */
::-webkit-scrollbar-track:hover {
  background-color: #1c1c1c;
}

/* 滑块：默认通过内容区限定 (content-box) 实现极致的"细线"悬浮效果，两侧使用粗透明边框 */
::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.3);
  border: 6px solid transparent; 
  background-clip: content-box;
  border-radius: 99px;
  min-height: 40px;
}

/* --- 这里是核心：当鼠标准确放在滑块或滚动条上时 --- */

/* 1. 滑块触发变粗：减小透明边框，让内容区变大填满 */
::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.5);
  border: 1px solid transparent;
  border-radius: 0; /* 悬浮时变成了带直角的矩形，如你第二张图所示 */
}

/* 滑块被按住点击拖拽时的提亮反馈 */
::-webkit-scrollbar-thumb:active {
  background-color: rgba(255, 255, 255, 0.7);
  border: 1px solid transparent;
  border-radius: 0;
}
</style>
