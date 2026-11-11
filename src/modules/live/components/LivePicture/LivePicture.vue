<script setup lang="ts">
import { onBeforeUnmount, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { logError } from '@/shared/errors';

/**
 * The shared tab as it plays now, above the captions in the page: the video the user
 * follows, with no delay. Muted, since its sound already plays (at the chosen volume).
 */
const props = defineProps<{
  stream: MediaStream;
}>();

const { t } = useI18n();
const video = ref<HTMLVideoElement | null>(null);

watchEffect(() => {
  const element = video.value;
  if (!element) return;
  element.srcObject = props.stream;
  element.play().catch((err: unknown) => logError('Could not show the shared tab', err));
});

onBeforeUnmount(() => {
  if (video.value) video.value.srcObject = null;
});
</script>

<template>
  <figure class="live-picture">
    <video
      ref="video"
      muted
      autoplay
      playsinline
      disablepictureinpicture
      :aria-label="t('live.picture')"
    ></video>
  </figure>
</template>

<style scoped lang="scss">
// The picture fills the room its row gives it, letterboxed like any player
.live-picture {
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: #000;

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}
</style>
