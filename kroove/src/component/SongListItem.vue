<!-- src/component/SongListItem.vue -->
<script setup lang="ts">
import IconCheckboxOutline from '../assets/icons/IconCheckboxOutline.vue'
import IconPlayOutline from '../assets/icons/IconPlayOutline.vue'
import IconAdd from '../assets/icons/IconAdd.vue'
import IconEdit from '../assets/icons/IconEdit.vue'
import TrackEditDialog from './TrackEditDialog.vue'
import { usePlayerStore } from '../stores/player'
import { ref } from 'vue'

const props = defineProps<{
  id: number
  title: string
  artist: string
  album: string
  genre: string
  duration: string
  isActive?: boolean
}>()

const playerStore = usePlayerStore()

const showEditDialog = ref(false)

const handlePlay = (e: Event) => {
  e.stopPropagation()
  playerStore.playById(props.id)
}
</script>

<template>
  <div class="song-list-item" :class="{ active: isActive }" @dblclick="playerStore.playById(id)">
    <div class="column title-col">
      <!-- 鼠标悬浮时显示的 Checkbox 占位与图标 -->
      <div class="checkbox-area">
        <IconCheckboxOutline style="width: 18px; height: 18px;" />
      </div>

      <span class="text">{{ title }}</span>

      <!-- 鼠标悬浮时显示的操作按钮 (只在hover时出现) -->
      <div class="hover-actions">
        <button class="action-btn play-btn" title="播放" @click="handlePlay">
          <IconPlayOutline style="width: 16px; height: 16px;" />
        </button>
        <button class="action-btn add-btn" title="添加到..">
          <IconAdd style="width: 18px; height: 18px;" />
        </button>
        <button class="action-btn edit-btn" title="编辑信息" @click.stop="showEditDialog = true">
          <IconEdit style="width: 18px; height: 18px;" />
        </button>
      </div>

      <!-- 编辑对话框 -->
      <TrackEditDialog 
        v-model="showEditDialog" 
        :track-id="id" 
      />
    </div>
    <div class="column artist">{{ artist }}</div>
    <div class="column album">{{ album }}</div>
    <div class="column genre">{{ genre }}</div>
    <div class="column duration">{{ duration }}</div>
  </div>
</template>

<style scoped>
.song-list-item {
  display: flex;
  align-items: center;
  height: 52px;
  cursor: default;
  color: #ccc;
  font-size: 14px;
  background: transparent;
  transition: background 0.1s;
}

/* 图2的奇偶背景交替 (斑马线效果) */
.song-list-item:nth-child(even) {
  background: rgba(255, 255, 255, 0.03);
}

/* 图3的 Hover 高亮背景 */
.song-list-item:hover {
  background: rgba(255, 255, 255, 0.12);
}

.song-list-item.active {
  color: #0078d4;
}

.column {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-col {
  display: flex;
  align-items: center;
  flex: 0 0 35%;
  position: relative;
  padding-left: 48px;  /* 预留 checkbox 的位置，保证静止和hover时文字不位移 */
  padding-right: 16px;
  height: 100%;
  color: #fff;
}

.song-list-item.active .title-col {
  color: #0078d4;
}

/* 左侧多选框 (静止时隐藏，Hover时浮现) */
.checkbox-area {
  position: absolute;
  left: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  color: #fff;
}

.song-list-item:hover .checkbox-area {
  opacity: 1;
}

.text {
  flex: 0 1 auto; /* 允许收缩，但不强行撑满，使得后面的按钮能紧贴着文字 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 悬浮操作按钮区，紧贴在文字后方 */
.hover-actions {
  display: none;
  align-items: center;
  gap: 4px;
  margin-left: 16px; /* 和文字保持一点距离 */
  flex-shrink: 0;
}

.song-list-item:hover .hover-actions {
  display: flex;
}

.action-btn {
  background: transparent;
  border: none;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  height: 36px;
  width: 36px;
  border-radius: 4px;
  transition: background 0.1s;
}

/* 图3表现出播放按钮带有独立的底色 (仅在真正hover到该按钮时出现) */
.play-btn {
  background: transparent;
}

.play-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.add-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.edit-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.artist {
  flex: 0 0 20%;
}

.album {
  flex: 0 0 20%;
}

.genre {
  flex: 0 0 15%;
}

.duration {
  flex: 1;
  text-align: right;
  padding-right: 24px;
}
</style>
