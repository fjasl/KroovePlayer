<script setup lang="ts">
import { ref } from 'vue'
import SongListItem from '../component/SongListItem.vue'
import GrooveVirtualList from '../component/GrooveVirtualList.vue'
import EmptyState from '../component/EmptyState.vue'
import SettingsView from '../component/SettingsView.vue'
import { usePlayerStore } from '../stores/player'

defineProps<{
  activeSidebar?: string
}>()

const playerStore = usePlayerStore()
const activeTab = ref('songs')

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

    <template v-if="activeSidebar === 'home' || !activeSidebar">
      <header class="content-header">
        <h1>我的音乐</h1>
        <nav class="tabs">
          <span v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
            {{ tab.label }}
          </span>
        </nav>
      </header>

      <div class="content-area">
        <!-- 歌曲列表视图 -->
        <section v-if="activeTab === 'songs'" class="view-songs">
          <div class="empty-hint" v-if="playerStore.fullPlaylist.length === 0">
            <EmptyState />
          </div>

          <div class="song-list" v-else>
            <GrooveVirtualList :item-height="52" :buffer="5">
              <template #default="{ item, id }">
                <!-- 如果详情还没加载回来，显示一个高度占位，避免列表抽动 -->
                <div v-if="!item" class="song-item-loading" style="height: 52px; opacity: 0.1; background: #fff; margin: 4px 0; border-radius: 4px;"></div>
                
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
  background: black;
  color: white;
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* 给整个外层开启滚动，使得滚动条靠在最右侧且贯穿上下 */
  overflow-x: hidden;
}

.content-header {
  position: sticky;
  top: 0;
  background: #000; /* 改回纯黑，不透明 */
  z-index: 10;
  padding: 40px 40px 0 40px;
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
  /* 移除底边框，或让其透明，因为滚动过去时会更自然 */
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tabs span {
  padding-bottom: 10px;
  cursor: pointer;
  color: #aaa;
  font-size: 16px;
  transition: color 0.2s;
}

.tabs span:hover {
  color: #ddd;
}

.tabs span.active {
  color: #fff;
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
