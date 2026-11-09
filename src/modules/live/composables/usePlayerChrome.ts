import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { logError } from '@/shared/errors';

/** The controls fade out this long after the last move over the player */
export const CONTROLS_IDLE_MS = 2500;

export interface PlayerChrome {
  /** The player fills the screen */
  fullscreen: Ref<boolean>;
  /** The browser lets the player fill the screen */
  canFullscreen: boolean;
  /** Someone moved over the player, or is using its controls from the keyboard */
  awake: Ref<boolean>;
  toggleFullscreen: () => void;
  /** Shows the controls, and starts counting down to hiding them again */
  wake: () => void;
}

/**
 * What a video player wears around its picture: fullscreen for the whole player (so
 * the captions and controls go along), and controls that hide while nobody touches it.
 * A control focused from the keyboard keeps them shown.
 */
export function usePlayerChrome(root: Ref<HTMLElement | null>): PlayerChrome {
  const fullscreen = ref(false);
  const awake = ref(true);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;
  let timer = 0;

  function inUse(): boolean {
    const focused = document.activeElement;
    if (!root.value || !(focused instanceof HTMLElement) || !root.value.contains(focused)) {
      return false;
    }
    return focused instanceof HTMLSelectElement || focused.matches(':focus-visible');
  }

  function sleep(): void {
    if (inUse()) wake();
    else awake.value = false;
  }

  function wake(): void {
    awake.value = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(sleep, CONTROLS_IDLE_MS);
  }

  function toggleFullscreen(): void {
    const element = root.value;
    if (!element || !canFullscreen) return;
    const change =
      document.fullscreenElement === element
        ? document.exitFullscreen()
        : element.requestFullscreen({ navigationUI: 'hide' });
    change.catch((err: unknown) => logError('The player could not change fullscreen', err));
  }

  function onFullscreenChange(): void {
    fullscreen.value = root.value !== null && document.fullscreenElement === root.value;
    wake();
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange);
    wake();
  });
  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    window.clearTimeout(timer);
  });

  return { fullscreen, canFullscreen, awake, toggleFullscreen, wake };
}
