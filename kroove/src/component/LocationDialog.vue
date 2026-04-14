<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const playerStore = usePlayerStore()

// 自动把后端的 `['D:\Music', 'E:\M']` 转换成我们需要的 { name, path } 用于渲染
const folders = computed(() => {
  return playerStore.libraryFolders.map(p => {
    // 处理 Windows 和 Unix 路径分隔符，取最后一段作为 Folder Name
    const parts = p.split(/[/\\]/); 
    const name = parts.pop() || p;
    return { name, path: p };
  })
})

function closeDialog() {
  emit('update:modelValue', false)
}

function removeFolder(index: number) {
  // 通过对应的实际路径通知后端移除监视
  const targetPath = folders.value[index].path;
  playerStore.removeFolder(targetPath);
}

function addFolder() {
  // 由于浏览器环境限制不能直接弹系统原生的目录多选框
  // 所以这里暂时使用 Prompt 输入盘符绝对路径进行开发时打通，后续可换 Electron native API
  const newPath = prompt("请输入要监控的新曲库绝对路径（例如: D:\\Music）:");
  if (newPath && newPath.trim() !== '') {
    playerStore.addFolder(newPath.trim());
  }
}
</script>

<template>
  <div v-if="modelValue" class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog-content">
      <h2>从本地曲库创建个人“收藏”</h2>
      <p class="subtitle">现在我们正在查看这些文件夹：</p>
      
      <div class="folder-list">
        <!-- 添加大按钮 -->
        <button class="add-folder-box" @click="addFolder">
          <svg class="plus-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.5 11.5V5H12.5V11.5H19V12.5H12.5V19H11.5V12.5H5V11.5H11.5Z" fill="currentColor"/>
          </svg>
        </button>

        <!-- 已有文件夹列表 -->
        <div class="folder-item" v-for="(folder, index) in folders" :key="index">
          <div class="folder-info">
            <span class="folder-name">{{ folder.name }}</span>
            <span class="folder-path">{{ folder.path }}</span>
          </div>
          <button class="remove-btn" @click="removeFolder(index)" title="移除">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18.3 5.71L17.59 5L11.65 10.94L5.71 5L5 5.71L10.94 11.65L5 17.59L5.71 18.3L11.65 12.36L17.59 18.3L18.3 17.59L12.36 11.65L18.3 5.71Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="dialog-actions">
        <button class="done-btn" @click="closeDialog">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.dialog-content {
  background-color: var(--bg-main);
  border: 1px solid #0078d4;
  width: 400px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.dialog-content h2 {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 400;
  margin: 0 0 12px 0;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 24px 0;
}

.folder-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 40px;
  max-height: 50vh;
  overflow-y: auto;
  padding-right: 4px; 
}

/* 轨道样式适配 */
.folder-list::-webkit-scrollbar {
  width: 4px;
}
.folder-list::-webkit-scrollbar-thumb {
  background-color: var(--border-color);
  border-radius: 4px;
}

.add-folder-box {
  background-color: var(--hover-bg);
  min-height: 80px;
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background-color 0.1s;
}

.add-folder-box:hover {
  filter: brightness(0.9);
}

.plus-icon {
  width: 32px;
  height: 32px;
  color: var(--text-primary);
}

.folder-item {
  background-color: var(--hover-bg);
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
}

.folder-item:hover {
  filter: brightness(0.9);
}

.folder-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.folder-name {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 600;
}

.folder-path {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-btn {
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.remove-btn:hover {
  background-color: var(--hover-bg);
}

.remove-btn svg {
  width: 12px;
  height: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
}

.done-btn {
  background-color: var(--hover-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 8px 32px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.1s;
}

.done-btn:hover {
  background-color: var(--text-primary);
  color: var(--bg-main);
}
</style>
