<script setup lang="ts">
import { ref } from 'vue'
import SongListItem from '../component/SongListItem.vue'
import GrooveVirtualList from '../component/GrooveVirtualList.vue'
import EmptyState from '../component/EmptyState.vue'
import SettingsView from '../component/SettingsView.vue'
import LibraryUpdateToast from '../component/LibraryUpdateToast.vue'
import { usePlayerStore } from '../stores/player'

defineProps<{
  activeSidebar?: string
}>()

const playerStore = usePlayerStore()

const tabs = [
  { id: 'songs', label: '歌曲' },
  { id: 'artists', label: '歌手' },
  { id: 'albums', label: '专辑' }
]

const formatTime = (seconds: number) => {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <main class="main-content">
    <LibraryUpdateToast />

    <template v-if="activeSidebar === 'home' || !activeSidebar">
      <header class="content-header">
        <h1>我的音乐</h1>
        <nav class="tabs">
          <span v-for="tab in tabs" :key="tab.id" :class="{ active: playerStore.activeTab === tab.id }" @click="playerStore.activeTab = tab.id">
            {{ tab.label }}
          </span>
        </nav>
      </header>

      <div class="content-area">
        <!-- 歌曲列表视图 -->
        <section v-if="playerStore.activeTab === 'songs'" class="view-songs">
          <div class="empty-hint" v-if="playerStore.fullPlaylist.length === 0">
            <EmptyState />
          </div>

          <div class="song-list" v-else>
            <GrooveVirtualList :item-height="52" :buffer="5">
              <template #default="{ item, id }">
                <!-- 如果详情还没加载回来，显示一个高度占位，避免列表抽动 -->
                <div v-if="!item" class="song-item-loading" style="height: 52px; opacity: 0.05; background: var(--text-primary); margin: 4px 0; border-radius: 4px;"></div>
                
                <SongListItem v-else
                  :key="id" 
                  :id="item.id"
                  :title="item.title" 
                  :artist="item.artist"
                  :album="item.album" 
                  :genre="item.genre || '未知流派'" 
                  :duration="formatTime(item.duration)" 
                  :isActive="playerStore.currentTrack.id === item.id" />
              </template>
            </GrooveVirtualList>
          </div>
        </section>

        <!-- 歌手/专辑 空页面视图 -->
        <section v-else class="view-empty">
          <EmptyState />
        </section>
      </div>
    </template>

    <!-- 侧边栏除了“我的音乐”之外的其他功能视图 -->
    <template v-else-if="activeSidebar === 'settings'">
      <SettingsView />
    </template>

    <template v-else>
      <div class="global-empty-area">
        <EmptyState :message="activeSidebar === 'recent' ? '你还没有最近播放的内容哦' :
          (activeSidebar === 'playing' ? '当前播放列表中并没有音乐' : '施工中...')" />
      </div>
    </template>

  </main>
</template>

<style scoped>
.main-content {
  flex: 1;
  position: relative;
  background: var(--bg-main);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  overflow-y: auto; 
  overflow-x: hidden;
  transition: background 0.3s ease, color 0.3s ease;
}

.content-header {
  position: sticky;
  top: 0;
  background: var(--bg-header); 
  z-index: 10;
  padding: 40px 40px 0 40px;
  transition: background 0.3s ease;
}

.content-header h1 {
  font-size: 42px;
  font-weight: 300;
  margin-bottom: 20px;
}

.tabs {
  display: flex;
  gap: 30px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.tabs span {
  padding-bottom: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 16px;
  transition: color 0.2s;
}

.tabs span:hover {
  color: var(--text-primary);
}

.tabs span.active {
  color: var(--text-primary);
  border-bottom: 2px solid #0078d4;
}

.content-area {
  padding: 0 40px 40px 40px; /* 补回内边距 */
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 180px); /* 保证空状态依然居中 */
}

.view-songs {
  display: flex;
  flex-direction: column;
}

.list-controls {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #aaa;
  margin-bottom: 20px;
  align-items: center;
}

.list-controls a {
  color: #0078d4;
  text-decoration: none;
}

.list-controls a:hover {
  text-decoration: underline;
}

.song-list {
  display: flex;
  flex-direction: column;
}

.view-empty,
.global-empty-area {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 400px;
  height: 100%;
}
</style>
