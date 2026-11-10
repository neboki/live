import { onBeforeUnmount, ref, type Ref } from 'vue';

/** How long the way out of full screen stays visible after a tap */
export const REVEAL_MS = 3000;

export interface TapReveal {
  /** The hidden control is showing right now */
  shown: Ref<boolean>;
  /** Shows it, and starts counting down to hiding it again */
  reveal: () => void;
}

/**
 * Full screen shows only the text; a tap anywhere brings back the one button that
 * leaves it, for a few seconds.
 */
export function useTapReveal(): TapReveal {
  const shown = ref(false);
  let timer = 0;

  function reveal(): void {
    shown.value = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      shown.value = false;
    }, REVEAL_MS);
  }

  onBeforeUnmount(() => window.clearTimeout(timer));
  return { shown, reveal };
}
