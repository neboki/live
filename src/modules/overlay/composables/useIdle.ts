import { onBeforeUnmount, ref, watch, type Ref, type WatchSource } from 'vue';

const IDLE_AFTER_MS = 3500;

/** Becomes true after a while without changes in `sources`. */
export function useIdle(sources: WatchSource[], delayMs = IDLE_AFTER_MS): Ref<boolean> {
  const idle = ref(false);
  let timer = 0;

  function wake(): void {
    idle.value = false;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => (idle.value = true), delayMs);
  }

  watch(sources, wake, { immediate: true });
  onBeforeUnmount(() => window.clearTimeout(timer));

  return idle;
}
