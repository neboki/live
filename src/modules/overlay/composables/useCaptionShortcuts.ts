import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useExportSession } from '@/modules/session';
import { useFloatingWindow } from '../store/useFloatingWindow';
import { useOverlayStore } from '../store/useOverlayStore';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Typing in a field must never toggle the bar. Works across the floating window too. */
function isEditable(target: EventTarget | null): boolean {
  if (typeof target !== 'object' || target === null || !('tagName' in target)) return false;
  const el = target as HTMLElement;
  return EDITABLE_TAGS.has(el.tagName) || el.isContentEditable;
}

/**
 * The caption bar's keyboard shortcuts, wherever the bar is: Ctrl+Shift+Space shows or
 * hides it, Ctrl+Shift+E exports the session. Listens in the page and in the floating
 * window, each a window of its own with its own keyboard events.
 */
export function useCaptionShortcuts(): void {
  const store = useOverlayStore();
  const floating = useFloatingWindow();
  const { exportSession } = useExportSession();

  function onKeydown(event: KeyboardEvent): void {
    // A held key must not flicker the bar or export over and over
    if (!event.ctrlKey || !event.shiftKey || event.repeat || isEditable(event.target)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      store.hidden = !store.hidden;
    } else if (event.code === 'KeyE') {
      event.preventDefault();
      exportSession();
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    floating.pipWindow?.removeEventListener('keydown', onKeydown);
  });
  watch(
    () => floating.pipWindow,
    (win, old) => {
      old?.removeEventListener('keydown', onKeydown);
      win?.addEventListener('keydown', onKeydown);
    },
  );
}
