<script setup lang="ts">
/** Corners pointing out (go full screen) or in (leave it) */
defineProps<{ on: boolean }>();
</script>

<template>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      :d="on ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
