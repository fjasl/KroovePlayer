<script setup lang="ts">
const props = defineProps<{
  modelValue: string | number
  value: string | number
  label: string
}>()
const emit = defineEmits<{
  'update:modelValue': [val: string | number]
}>()
</script>

<template>
  <label class="groove-radio-wrapper">
    <input 
      type="radio" 
      class="hidden-input" 
      :checked="modelValue === value"
      @change="emit('update:modelValue', value)"
    />
    <div class="groove-radio">
      <div class="groove-radio-inner" :class="{ 'is-active': modelValue === value }"></div>
    </div>
    <span class="groove-radio-label">{{ label }}</span>
  </label>
</template>

<style scoped>
.groove-radio-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  margin-bottom: 12px;
  width: fit-content;
}
.hidden-input {
  display: none;
}
.groove-radio {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #ccc;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
  box-sizing: border-box;
}
.groove-radio-wrapper:hover .groove-radio {
  border-color: #fff;
}
.hidden-input:checked + .groove-radio {
  border-color: #0078d4;
}
.groove-radio-inner {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: transparent;
  transition: all 0.2s;
  transform: scale(0);
}
.groove-radio-inner.is-active {
  background: #0078d4;
  transform: scale(1);
}
.groove-radio-label {
  color: #fff;
  font-size: 14px;
  user-select: none;
}
</style>
