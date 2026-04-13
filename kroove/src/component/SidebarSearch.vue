<!-- src/component/SidebarSearch.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import IconSearch from '../assets/icons/IconSearch.vue';

defineProps<{
  isExpanded: boolean;
}>();

const emit = defineEmits(['toggle-sidebar']);

const isFocused = ref(false);
</script>

<template>
  <!-- 容器始终保持 48px 高且无缝衔接 -->
  <div class="search-container" :class="{ 'is-expanded-container': isExpanded, 'is-active': isExpanded && isFocused }">
    <div 
      class="search-box" 
      @click="!isExpanded && emit('toggle-sidebar')"
    >
      <input 
        type="text" 
        placeholder="搜索" 
        class="search-input"
        :class="{ 
          'show-input': isExpanded,
          'input-active': isFocused 
        }"
        @focus="isFocused = true"
        @blur="isFocused = false"
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
  background: rgba(255, 255, 255, 0.08); /* 悬浮效果与普通项一致 */
}

/* 延展开后的视觉边距优化 */
.is-expanded-container .search-box {
  height: 32px;  /* 延展态视觉高度 */
  margin: 0 12px; /* 这里是你要的延展开后的边距 */
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.is-expanded-container .search-box:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* 激活（有焦点）时的特定样式 */
.is-active .search-box {
  background: white !important;
  border-color: white !important;
}

.search-input {
  background: transparent;
  border: none;
  color: white;
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
  color: #ccc;
}

.is-dark { color: #333; }
</style>
