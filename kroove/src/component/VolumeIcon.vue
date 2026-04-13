<!-- src/component/VolumeIcon.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import IconVolumeMute from '../assets/icons/IconVolumeMute.vue';
import IconVolume0 from '../assets/icons/IconVolume0.vue';
import IconVolume1 from '../assets/icons/IconVolume1.vue';
import IconVolume2 from '../assets/icons/IconVolume2.vue';

const props = defineProps<{
  volume: number;   // 0 - 100
  isMuted: boolean;
}>();

const currentIcon = computed(() => {
  if (props.isMuted) return IconVolumeMute;
  if (props.volume === 0) return IconVolume0;
  if (props.volume < 60) return IconVolume1;
  return IconVolume2;
});
</script>

<template>
  <component :is="currentIcon" />
</template>
