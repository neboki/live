import { defineStore } from 'pinia';
import { computed, watch } from 'vue';
import type { AppError } from '@/shared/errors';
import { createDocumentPip } from '@/shared/pip/useDocumentPip';
import { DEFAULT_PIP_SIZE } from '../constants';
import { useOverlayStore } from './useOverlayStore';

/** Waits for the user to stop resizing the floating window before saving its size */
const RESIZE_DEBOUNCE_MS = 300;

/**
 * The always-on-top window (Document Picture-in-Picture) where a live session shows
 * its captions. It outlives the page's views: it opens with the session's first click
 * and closes when the session ends. It reopens at the size the user last gave it.
 */
export const useFloatingWindow = defineStore('floating', () => {
  const overlay = useOverlayStore();
  const pip = createDocumentPip();
  const isOpen = computed(() => pip.pipWindow.value !== null);
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Requested size minus the size the window got (its title bar), to ask for the same next time */
  let frame = { width: 0, height: 0 };

  /**
   * Opens the window, or keeps the one already open. Uses up the click, so it must run
   * synchronously in the click handler, after the share dialog was requested.
   */
  async function open(): Promise<AppError | null> {
    if (isOpen.value) return null;
    const size = overlay.pipSize ?? DEFAULT_PIP_SIZE;
    const error = await pip.open(size);
    const win = pip.pipWindow.value;
    if (win) frame = { width: size.width - win.innerWidth, height: size.height - win.innerHeight };
    // The window has no minimize button: a bar minimized in the demo would stay stuck
    overlay.minimized = false;
    return error;
  }

  function onResize(event: Event): void {
    const win = event.currentTarget as Window | null;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!win || win.closed) return;
      overlay.pipSize = {
        width: win.innerWidth + frame.width,
        height: win.innerHeight + frame.height,
      };
    }, RESIZE_DEBOUNCE_MS);
  }

  watch(pip.pipWindow, (win, old) => {
    old?.removeEventListener('resize', onResize);
    win?.addEventListener('resize', onResize);
  });

  return {
    isSupported: pip.isSupported,
    pipWindow: pip.pipWindow,
    body: pip.pipBody,
    isOpen,
    open,
    close: pip.close,
  };
});
