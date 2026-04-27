<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="{ transform: `rotate(${isOpen ? 180 : 0}deg)`, transition: 'transform 0.2s ease' }"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{
  isOpen?: boolean
}>()
</script>

<style scoped>
svg {
  display: inline-block;
}
</style>

