import { ref, type Ref } from 'vue';
import { BAR_HEIGHT, BAR_WIDTH } from '../constants';
import { useOverlayStore } from '../store/useOverlayStore';

export type ResizeEdge = 'left' | 'right' | 'top' | 'top-left' | 'top-right';

export interface Resizable {
  resizing: Ref<boolean>;
  /** Starts a drag on one of the bar's edges */
  startResize: (edge: ResizeEdge, event: PointerEvent) => void;
  /** Arrow keys on the resize grip: ↑↓ change the height, ←→ the width */
  onResizeKey: (event: KeyboardEvent) => void;
}

/** Space kept free on each side of the window when the bar is made wider */
const WINDOW_MARGIN = 16;

/**
 * Resizes the caption bar from its edges. The bar is always anchored at its
 * bottom centre (in the demo, on the live page), so it grows symmetrically:
 * the width changes twice the horizontal drag, so the edge follows the pointer,
 * and the top edge changes the height of the caption area only.
 */
export function useResizable(
  bar: Ref<HTMLElement | null>,
  lines: () => HTMLElement | null,
): Resizable {
  const store = useOverlayStore();
  const resizing = ref(false);

  function maxWidth(el: HTMLElement): number {
    const win = el.ownerDocument.defaultView;
    return win ? Math.min(BAR_WIDTH.max, win.innerWidth - WINDOW_MARGIN * 2) : BAR_WIDTH.max;
  }

  function resize(width: number | undefined, height: number | undefined): void {
    const el = bar.value;
    if (!el) return;
    store.setSize({
      ...(width === undefined ? {} : { width: Math.min(width, maxWidth(el)) }),
      ...(height === undefined ? {} : { height }),
    });
  }

  function startResize(edge: ResizeEdge, event: PointerEvent): void {
    const el = bar.value;
    const area = lines();
    // No instanceof: inside the floating window the handle belongs to another window
    const handle = event.currentTarget as Element | null;
    if (!el || !area || !handle || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = el.offsetWidth;
    const startHeight = area.offsetHeight;
    const sideways = edge === 'left' || edge === 'top-left' ? -2 : 2;
    const horizontal = edge !== 'top';
    const vertical = edge.startsWith('top');
    resizing.value = true;

    const onMove = (move: PointerEvent): void => {
      resize(
        horizontal ? startWidth + (move.clientX - startX) * sideways : undefined,
        vertical ? startHeight - (move.clientY - startY) : undefined,
      );
    };
    const onEnd = (): void => {
      resizing.value = false;
      handle.removeEventListener('pointermove', onMove as EventListener);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
    };
    handle.addEventListener('pointermove', onMove as EventListener);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // The pointer was already released: the drag simply ends on the next event
    }
  }

  function onResizeKey(event: KeyboardEvent): void {
    const el = bar.value;
    const area = lines();
    if (!el || !area) return;
    const steps: Record<string, [number, number]> = {
      ArrowUp: [0, BAR_HEIGHT.step],
      ArrowDown: [0, -BAR_HEIGHT.step],
      ArrowRight: [BAR_WIDTH.step, 0],
      ArrowLeft: [-BAR_WIDTH.step, 0],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    const [dw, dh] = step;
    resize(dw ? el.offsetWidth + dw : undefined, dh ? area.offsetHeight + dh : undefined);
  }

  return { resizing, startResize, onResizeKey };
}
