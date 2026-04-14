<!-- src/component/SidebarSearch.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import IconSearch from '../assets/icons/IconSearch.vue';
import { usePlayerStore } from '../stores/player';

defineProps<{
  isExpanded: boolean;
}>();

const emit = defineEmits(['toggle-sidebar']);

const playerStore = usePlayerStore();
const isFocused = ref(false);
let debounceTimer: any = null;

const handleSearch = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    playerStore.search(playerStore.searchQuery);
  }, 300);
};
</script>

<template>
  <!-- 容器始终保持 48px 高且无缝衔接 -->
  <div class="search-container" :class="{ 'is-expanded-container': isExpanded, 'is-active': isExpanded && isFocused }">
    <div 
      class="search-box" 
      @click="!isExpanded && emit('toggle-sidebar')"
    >
      <input 
        v-model="playerStore.searchQuery"
        type="text" 
        placeholder="搜索" 
        class="search-input"
        :class="{ 
          'show-input': isExpanded,
          'input-active': isFocused 
        }"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @input="handleSearch"
      />
      <div class="search-icon-wrapper">
        <IconSearch 
          class="search-icon" 
          :class="{ 'is-dark': isExpanded && isFocused }" 
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  height: 48px; /* 逻辑占位始终 48px */
  margin: 0;    /* 无缝排版，移除物理缝隙 */
  display: flex;
  align-items: center;
}

.search-box {
  width: 100%;
  height: 48px; /* 未延展时全高，与汉堡菜单和项目按钮样式一致 */
  display: flex;
  align-items: center;
  position: relative;
  cursor: pointer;
  background: transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid transparent;
}

.search-box:hover {
  background: var(--hover-bg); 
}

/* 延展开后的视觉边距优化 */
.is-expanded-container .search-box {
  height: 32px;  
  margin: 0 12px; 
  background: var(--hover-bg);
  border: 1px solid var(--border-color);
}

.is-expanded-container .search-box:hover {
  background: var(--hover-bg);
  filter: brightness(0.95);
}

/* 激活（有焦点）时的特定样式 */
.is-active .search-box {
  background: white !important;
  border-color: white !important;
}

.search-input {
  background: transparent;
  border: none;
  color: var(--text-primary);
  padding: 0 40px 0 10px;
  width: 100%;
  height: 100%;
  outline: none;
  font-size: 14px;
  opacity: 0;
  pointer-events: none;
}

.show-input {
  opacity: 1;
  pointer-events: auto;
}

.input-active {
  color: #000;
}

.search-input::placeholder { color: #ccc; }
.input-active::placeholder { color: #666; }

.search-icon-wrapper {
  position: absolute;
  right: 0;
  width: 48px;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: width 0.2s;
}

.is-expanded-container .search-icon-wrapper {
  width: 32px; /* 延展态图标区域缩小以适配边距 */
}

.search-icon {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

.is-dark { color: #111; }
</style>
