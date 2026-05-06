<script setup lang="ts">
import { ref } from 'vue'
import GrooveSwitch from './GrooveSwitch.vue'
import GrooveRadio from './GrooveRadio.vue'
import GrooveLink from './GrooveLink.vue'
import GrooveSelect from './GrooveSelect.vue'
import LocationDialog from './LocationDialog.vue'
import { usePlayerStore } from '../stores/player'
import { API_BASE } from '../stores/player'
import { onMounted } from 'vue'

const playerStore = usePlayerStore()

const autoRetrieve = ref(true)
const artistLockScreen = ref(false)
const artistWallpaper = ref(false)
const selectedTheme = ref('jazz')

const lyricModeOptions = ref<{ label: string; value: string }[]>([])

onMounted(async () => {
  try {
    const res = await fetch(`${API_BASE}/api/render/modes`)
    if (res.ok) {
      lyricModeOptions.value = await res.json()
    }
  } catch (err) {
    console.error('Failed to fetch render modes:', err)
  }
})

const themeOptions = [
  { label: '爵士', value: 'jazz' },
  { label: '电子', value: 'electronic' },
  { label: '民谣', value: 'folk' },
  { label: '嘻哈', value: 'hiphop' },
  { label: '金属', value: 'metal' },
  { label: '古典', value: 'classical' },
  { label: '布鲁斯', value: 'blues' },
  { label: '朋克', value: 'punk' },
  { label: '灵魂', value: 'soul' },
  { label: '放克', value: 'funk' }
]


const showLocationDialog = ref(false)

function openLocationDialog() {
  showLocationDialog.value = true
}
</script>

<template>
  <div class="settings-view">
    <header>
      <h1>设置</h1>
    </header>

    <div class="settings-container">
      <!-- 左侧主栏 -->
      <div class="settings-column main-col">
        
        <section class="settings-section">
          <h2>此 PC 上的音乐</h2>
          <GrooveLink @click="openLocationDialog">选择查找音乐的位置</GrooveLink>
        </section>

        <section class="settings-section">
          <h2>播放</h2>
          <GrooveLink>均衡器</GrooveLink>
        </section>


        <section class="settings-section">
          <h2>媒体信息</h2>
          <p class="description">自动检索并更新缺失的专辑封面和元数据</p>
          <GrooveSwitch v-model="autoRetrieve" />
        </section>

        <section class="settings-section">
          <h2>显示艺术家曲目</h2>
          <div class="option-block">
            <p class="description">将"正在播放"中的艺术家曲目设置为我的锁屏界面</p>
            <GrooveSwitch v-model="artistLockScreen" />
          </div>
          
          <div class="option-block">
            <p class="description">全屏模式下渲染具有动态艺术感的随机歌词</p>
            <GrooveSwitch v-model="playerStore.enableLyricsAnimation" />
          </div>
          
          <div class="option-block">
            <p class="description">全屏模式下渲染具有律动感的音频频谱</p>
            <GrooveSwitch v-model="playerStore.enableSpectrum" />
          </div>
        </section>

        <section class="settings-section">
          <h2>歌词动画</h2>
          <p class="description">全屏模式下的歌词渲染风格</p>
          <GrooveSelect v-model="playerStore.lyricMode" :options="lyricModeOptions" placeholder="选择动画风格" />
        </section>

        <section class="settings-section">
          <h2>模式</h2>
          <GrooveRadio v-model="playerStore.themeMode" value="light" label="浅色" />
          <GrooveRadio v-model="playerStore.themeMode" value="dark" label="深色" />
          <GrooveRadio v-model="playerStore.themeMode" value="system" label="使用系统设置" />
        </section>

      </div>

      <!-- 右侧侧栏 -->
      <div class="settings-column side-col">
        <section class="settings-section">
          <h2>帐户</h2>
          <GrooveLink style="display: block; margin-bottom: 12px;">查看帐户</GrooveLink>
          <GrooveLink style="display: block;">订单历史记录</GrooveLink>
        </section>

        <section class="settings-section">
          <h2>应用</h2>
          <GrooveLink style="display: block; margin-bottom: 12px;">帮助</GrooveLink>
          <GrooveLink style="display: block; margin-bottom: 12px;">反馈</GrooveLink>
          <GrooveLink style="display: block;">关于</GrooveLink>
        </section>
      </div>

    </div>

    <!-- 弹窗挂载点 -->
    <LocationDialog v-model="showLocationDialog" />
  </div>
</template>

<style scoped>
.settings-view {
  color: var(--text-primary);
  flex: 1;
}

/* 吸顶的大标题 */
header {
  position: sticky;
  top: 0;
  background: var(--bg-header); 
  z-index: 10;
  padding: 40px 40px 0 40px;
  transition: background 0.3s ease;
}

header h1 {
  font-size: 42px;
  font-weight: 300;
  margin-bottom: 40px;
}

.settings-container {
  display: flex;
  gap: 120px;
  padding: 0 40px 40px 40px;
}

.settings-column {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.main-col {
  flex: 2;
  max-width: 500px;
}

.side-col {
  flex: 1;
}

.settings-section h2 {
  font-size: 24px;
  font-weight: 400;
  margin-bottom: 16px;
}

.description {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.option-block {
  margin-bottom: 24px;
}
.option-block:last-child {
  margin-bottom: 0;
}
</style>
