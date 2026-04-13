<!-- src/assets/icons/IconPlaying.vue -->
<template>
  <svg viewBox="40 28 176 98" xmlns="http://www.w3.org/2000/01/svg">
    <defs>
      <!-- 定义剪裁路径，强制在 Y=126 处切开 -->
      <clipPath id="top-cut">
        <rect x="0" y="0" width="256" height="126" />
      </clipPath>
    </defs>
    <path 
      fill="currentColor" 
      stroke="currentColor"
      stroke-width="16"
      stroke-linecap="round"
      stroke-linejoin="round"
      clip-path="url(#top-cut)"
      d="M52,96v64a4,4,0,0,1-8,0V96a4,4,0,0,1,8,0ZM88,28a4,4,0,0,0-4,4V224a4,4,0,0,0,8,0V32A4,4,0,0,0,88,28Zm40,32a4,4,0,0,0-4,4V192a4,4,0,0,0,8,0V64A4,4,0,0,0,128,60Zm40,32a4,4,0,0,0-4,4v64a4,4,0,0,0,8,0V96A4,4,0,0,0,168,92Zm40-16a4,4,0,0,0-4,4v96a4,4,0,0,0,8,0V80A4,4,0,0,0,208,76Z" 
    />
  </svg>
</template>

<style scoped>
svg {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  display: block;
}
</style>
