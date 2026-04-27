<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import IconChevronDown from '../assets/icons/IconChevronDown.vue'

interface SelectOption {
  label: string
  value: string | number
}

const props = defineProps<{
  modelValue: string | number
  options: SelectOption[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const isOpen = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const selectedLabel = () => {
  const option = props.options.find(opt => opt.value === props.modelValue)
  return option?.label || props.placeholder || '请选择'
}

const handleSelect = (value: string | number) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

const toggleDropdown = () => {
  isOpen.value = !isOpen.value
}

/* ===== 点击外部关闭 ===== */
const handleClickOutside = (event: MouseEvent) => {
  if (wrapperRef.value && !wrapperRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

/* ===== 展开/收起动画钩子 ===== */
function onBeforeEnter(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.maxHeight = '0'
  htmlEl.style.opacity = '0'
  htmlEl.style.overflow = 'hidden'
}

function onEnter(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  void htmlEl.offsetHeight
  htmlEl.style.transition = 'max-height 0.2s ease-out, opacity 0.15s ease'
  htmlEl.style.maxHeight = htmlEl.scrollHeight + 'px'
  htmlEl.style.opacity = '1'
  const onEnd = () => { done() }
  htmlEl.addEventListener('transitionend', onEnd, { once: true })
}

function onAfterEnter(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.maxHeight = ''
  htmlEl.style.overflow = ''
  htmlEl.style.transition = ''
}

function onBeforeLeave(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.maxHeight = htmlEl.scrollHeight + 'px'
  htmlEl.style.opacity = '1'
  htmlEl.style.overflow = 'hidden'
}

function onLeave(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement
  void htmlEl.offsetHeight
  htmlEl.style.transition = 'max-height 0.18s ease-in, opacity 0.12s ease'
  htmlEl.style.maxHeight = '0'
  htmlEl.style.opacity = '0'
  const onEnd = () => { done() }
  htmlEl.addEventListener('transitionend', onEnd, { once: true })
}

function onAfterLeave(el: Element) {
  const htmlEl = el as HTMLElement
  htmlEl.style.maxHeight = ''
  htmlEl.style.overflow = ''
  htmlEl.style.transition = ''
}
</script>

<template>
  <div ref="wrapperRef" class="groove-select-wrapper">
    <!-- 关闭时：显示当前选中值和箭头 -->
    <button class="groove-select-trigger" @click="toggleDropdown">
      <span class="select-value">{{ selectedLabel() }}</span>
      <span class="select-arrow">
        <IconChevronDown :is-open="isOpen" />
      </span>
    </button>

    <!-- 展开时：悬浮下拉面板，从选择框顶部开始覆盖，选中项在列表中高亮 -->
    <Transition
      :css="false"
      @before-enter="onBeforeEnter"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @before-leave="onBeforeLeave"
      @leave="onLeave"
      @after-leave="onAfterLeave"
    >
      <div v-if="isOpen" class="select-dropdown">
        <div
          v-for="option in options"
          :key="option.value"
          class="select-option"
          :class="{ 'is-selected': modelValue === option.value }"
          @click="handleSelect(option.value)"
        >
          <span class="option-label">{{ option.label }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ===== 外层容器 + 主题变量（深色默认） ===== */
.groove-select-wrapper {
  --select-bg: #111111;
  --select-border: #777777;
  --select-border-hover: #aaaaaa;
  --select-text: #ffffff;
  --select-highlight: #0078d4ff;
  --select-shadow: rgba(0, 0, 0, 0.8);
  --select-scrollbar: #555555;
  --select-scrollbar-hover: #777777;

  position: relative;
  display: inline-block;
  width: 100%;
  max-width: 300px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}


/* ===== 关闭时的选择框 ===== */
.groove-select-trigger {
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 2px solid var(--select-border);
  border-radius: 0;
  background: var(--select-bg);
  color: var(--select-text);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: border-color 0.15s ease;
  user-select: none;
  outline: none;
  box-sizing: border-box;
}

.groove-select-trigger:hover {
  border-color: var(--select-border-hover);
}

/* ===== 当前值文本 ===== */
.select-value {
  flex: 1;
  text-align: left;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 右侧箭头图标 ===== */
.select-arrow {
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--select-text);
  flex-shrink: 0;
}

.select-arrow :deep(svg) {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

/* ===== 悬浮下拉面板：从 top:0 覆盖选择框 ===== */
.select-dropdown {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: var(--select-bg);
  border: 2px solid var(--select-border);
  padding: 4px 0;
  max-height: 280px;
  overflow-y: auto;
  overflow-x: hidden;
  z-index: 1000;
  box-shadow: 0 6px 24px var(--select-shadow);
  box-sizing: border-box;
}

/* ===== 单个选项 ===== */
.select-option {
  padding: 8px 12px;
  color: var(--select-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background-color 0.08s ease;
  user-select: none;
  font-size: 15px;
}

.select-option:hover {
  background: var(--select-highlight);
}

.select-option.is-selected {
  background: var(--select-highlight);
}

.option-label {
  flex: 1;
}

/* ===== 滚动条 ===== */
.select-dropdown::-webkit-scrollbar {
  width: 4px;
}

.select-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.select-dropdown::-webkit-scrollbar-thumb {
  background: var(--select-scrollbar);
}

.select-dropdown::-webkit-scrollbar-thumb:hover {
  background: var(--select-scrollbar-hover);
}
</style>

<!-- 浅色主题覆盖：必须用非 scoped 才能匹配祖先 .theme-light -->
<style>
.theme-light .groove-select-wrapper {
  --select-bg: #ffffff;
  --select-border: #999999;
  --select-border-hover: #666666;
  --select-text: #111111;
  --select-highlight: #0078d4ff;
  --select-shadow: rgba(0, 0, 0, 0.15);
  --select-scrollbar: #bbbbbb;
  --select-scrollbar-hover: #999999;
}
</style>
