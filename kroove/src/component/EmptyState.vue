<script setup lang="ts">
import IconWarning from '../assets/icons/IconWarning.vue'

defineProps<{
  message?: string
}>()
</script>

<template>
  <div class="empty-state">
    <div class="icon">
      <IconWarning style="width: 48px; height: 48px;" />
    </div>
    <div class="message">{{ message || '并没有找到所有内容？' }}</div>
    <div class="sub-message">显示查找音乐的位置</div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #888;
  text-align: center;
}

.icon {
  margin-bottom: 20px;
  color: #555;
}

.message {
  font-size: 16px;
  color: #fff;
  margin-bottom: 8px;
}

.sub-message {
  font-size: 14px;
  color: #0078d4;
  cursor: pointer;
}

.sub-message:hover {
  text-decoration: underline;
}
</style>
