<!-- src/component/GrooveVirtualList.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { usePlayerStore } from '../stores/player'

const props = defineProps<{
  itemHeight: number
  buffer?: number
}>()

const playerStore = usePlayerStore()
const containerRef = ref<HTMLElement | null>(null)
let scrollParent: HTMLElement | null = null

// 核心状态
const scrollTop = ref(0)
const viewportHeight = ref(0)
const buffer = props.buffer || 10

// 计算索引范围
const startIndex = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - buffer)
})

const endIndex = computed(() => {
  const visibleCount = Math.ceil(viewportHeight.value / props.itemHeight)
  return Math.min(playerStore.queueIds.length - 1, startIndex.value + visibleCount + buffer * 2)
})

// 计算占位高度
const paddingTop = computed(() => startIndex.value * props.itemHeight)
const paddingBottom = computed(() => {
  const remaining = playerStore.queueIds.length - 1 - endIndex.value
  return Math.max(0, remaining * props.itemHeight)
})

// 当前可见的 ID 列表
const visibleIds = computed(() => {
  return playerStore.queueIds.slice(startIndex.value, endIndex.value + 1)
})

// 当可见范围变化时，触发异步详情拉取
watch(visibleIds, (newIds) => {
  if (newIds.length > 0) {
    playerStore.fetchBatchMetadata(newIds)
  }
}, { immediate: true })

const handleScroll = () => {
  if (scrollParent) {
    scrollTop.value = scrollParent.scrollTop
  }
}

const handleResize = () => {
  if (scrollParent) {
    viewportHeight.value = scrollParent.clientHeight
  }
}

onMounted(() => {
  // 寻找父级滚动容器 (main-content)
  scrollParent = containerRef.value?.closest('.main-content') || null
  if (scrollParent) {
    scrollParent.addEventListener('scroll', handleScroll)
    window.addEventListener('resize', handleResize)
    handleScroll()
    handleResize()
  }
})

onUnmounted(() => {
  if (scrollParent) {
    scrollParent.removeEventListener('scroll', handleScroll)
    window.removeEventListener('resize', handleResize)
  }
})
</script>

<template>
  <div ref="containerRef" class="groove-virtual-list">
    <!-- 顶部占位 -->
    <div class="v-shim-top" :style="{ height: paddingTop + 'px' }"></div>
    
    <!-- 内容区 -->
    <div class="v-list-content">
      <template v-for="(id, index) in visibleIds" :key="id">
        <slot 
          :item="playerStore.metadataMap.get(id)" 
          :index="startIndex + index"
          :id="id"
        ></slot>
      </template>
    </div>

    <!-- 底部占位 -->
    <div class="v-shim-bottom" :style="{ height: paddingBottom + 'px' }"></div>
  </div>
</template>

<style scoped>
.groove-virtual-list {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.v-list-content {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.v-shim-top, .v-shim-bottom {
  width: 100%;
  flex-shrink: 0;
  pointer-events: none;
}
</style>
