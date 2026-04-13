<script setup lang="ts">
import { ref } from 'vue'
import GrooveSwitch from './GrooveSwitch.vue'
import GrooveRadio from './GrooveRadio.vue'
import GrooveLink from './GrooveLink.vue'
import LocationDialog from './LocationDialog.vue'

const autoRetrieve = ref(true)
const artistLockScreen = ref(false)
const artistWallpaper = ref(false)

const themeMode = ref('system')
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
            <p class="description">将"正在播放"中的艺术家曲目设置为我的壁纸</p>
            <GrooveSwitch v-model="artistWallpaper" />
          </div>
        </section>

        <section class="settings-section">
          <h2>模式</h2>
          <GrooveRadio v-model="themeMode" value="light" label="浅色" />
          <GrooveRadio v-model="themeMode" value="dark" label="深色" />
          <GrooveRadio v-model="themeMode" value="system" label="使用系统设置" />
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
  color: #fff;
  flex: 1;
  /* 去除自身的滚动条，由外层 MainContent 统一负责滚动 */
}

/* 吸顶的大标题 */
header {
  position: sticky;
  top: 0;
  background: #000; /* 改回纯黑，不透明 */
  z-index: 10;
  padding: 40px 40px 0 40px; /* 改将边距加在内部 */
}

header h1 {
  font-size: 42px;
  font-weight: 300;
  margin-bottom: 40px;
}

.settings-container {
  display: flex;
  gap: 120px;
  padding: 0 40px 40px 40px; /* 内容自身保护自己的边距 */
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
  color: #ccc;
  margin-bottom: 12px;
}

.option-block {
  margin-bottom: 24px;
}
.option-block:last-child {
  margin-bottom: 0;
}
</style>
