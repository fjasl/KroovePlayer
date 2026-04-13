<script setup lang="ts">
// 简单超链接风格组件
</script>
<template>
  <a class="groove-link"><slot></slot></a>
</template>
<style scoped>
.groove-link {
  color: #0078d4;
  text-decoration: none;
  font-size: 14px;
  cursor: pointer;
  transition: color 0.2s;
}
.groove-link:hover {
  color: #5eb1f5; /* 较亮的蓝色作为hover */
}
</style>
