<!-- src/component/TrackEditDialog.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  trackId: number
  initialLrc?: string
  initialCover?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const lrcPath = ref('')
const coverPath = ref('')
const isSaving = ref(false)

// 当打开弹窗时，从后端获取最新的元数据
watch(() => props.modelValue, async (newVal) => {
  if (newVal) {
    try {
      const response = await fetch(`http://127.0.0.1:6344/api/track/details/${props.trackId}`)
      const data = await response.json()
      lrcPath.value = data.lrc_path || ''
      coverPath.value = data.cover_path || ''
    } catch (e) {
      console.error('获取详情失败:', e)
      lrcPath.value = props.initialLrc || ''
      coverPath.value = props.initialCover || ''
    }
  }
})

function closeDialog() {
  emit('update:modelValue', false)
}

async function handleSave() {
  if (isSaving.value) return
  isSaving.value = true

  try {
    const response = await fetch('http://127.0.0.1:6344/api/track/update-manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: props.trackId,
        lrcPath: lrcPath.value.trim(),
        coverPath: coverPath.value.trim()
      })
    })

    const result = await response.json()
    if (result.success) {
      closeDialog()
    } else {
      alert('更新失败: ' + (result.error || '未知错误'))
    }
  } catch (error) {
    console.error('保存出错:', error)
    alert('请求失败，请检查后端连接')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div v-if="modelValue" class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog-content">
      <h2>关联外部资源</h2>
      <p class="subtitle">手动指定该曲目的歌词文件与专辑封面</p>
      
      <div class="input-group">
        <label>歌词路径 (.lrc)</label>
        <input 
          v-model="lrcPath" 
          type="text" 
          placeholder="例如: D:\Music\Lrc\sample.lrc"
          class="path-input"
        />
      </div>

      <div class="input-group">
        <label>专辑封面路径 (.jpg/.png)</label>
        <input 
          v-model="coverPath" 
          type="text" 
          placeholder="例如: D:\Music\Cover\sample.jpg"
          class="path-input"
        />
      </div>

      <div class="dialog-actions">
        <button class="action-btn cancel-btn" @click="closeDialog">取消</button>
        <button class="action-btn save-btn" :disabled="isSaving" @click="handleSave">
          {{ isSaving ? '稍候...' : '确认关联' }}
        </button>
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
  background-color: #000;
  border: 1px solid #0078d4;
  width: 400px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.dialog-content h2 {
  color: #fff;
  font-size: 22px;
  font-weight: 400;
  margin: 0 0 12px 0;
}

.subtitle {
  color: #ccc;
  font-size: 14px;
  margin: 0 0 24px 0;
}

.input-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  color: #aaa;
  font-size: 13px;
}

.path-input {
  background-color: #2d2d2d;
  border: none;
  color: #fff;
  padding: 12px;
  font-size: 14px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.path-input:focus {
  background-color: #333;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.action-btn {
  background-color: #333;
  color: #fff;
  border: none;
  padding: 8px 32px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.action-btn:hover {
  background-color: #555;
}

.action-btn:active {
  background-color: #111;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background-color: transparent;
  color: #888;
}

.cancel-btn:hover {
  background-color: transparent;
  color: #fff;
}
</style>
