import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

export type PanelSide = 'above' | 'below';

export interface PanelPlacement {
  side: Ref<PanelSide>;
  /** Room left for the panel on that side, in pixels */
  maxHeight: Ref<number>;
}

/** Tallest the settings panel gets when there is room */
const PANEL_MAX_HEIGHT = 480;
/** Gap between the bar and the panel, plus a margin to the edge of the bounds */
const GAP = 8;
const EDGE = 12;
/** Ancestor that clips the bar (the demo stage); the window otherwise */
const BOUNDS_SELECTOR = '[data-overlay-bounds]';

/**
 * Opens the settings panel above the bar, where it covers the call least,
 * unless the bar sits near the top and there is more room below. It is placed
 * again whenever the bar changes size while open (a caption wrapping to a new line).
 */
export function usePanelPlacement(
  bar: Ref<HTMLElement | null>,
  open: Ref<boolean>,
): PanelPlacement {
  const side = ref<PanelSide>('above');
  const maxHeight = ref(PANEL_MAX_HEIGHT);
  let observer: ResizeObserver | null = null;

  function place(): void {
    const el = bar.value;
    const win = el?.ownerDocument.defaultView;
    if (!el || !win) return;
    const rect = el.getBoundingClientRect();
    const bounds = el.closest(BOUNDS_SELECTOR)?.getBoundingClientRect();
    const top = bounds?.top ?? 0;
    const bottom = bounds?.bottom ?? win.innerHeight;
    const above = rect.top - top - GAP - EDGE;
    const below = bottom - rect.bottom - GAP - EDGE;
    side.value = above >= PANEL_MAX_HEIGHT || above >= below ? 'above' : 'below';
    maxHeight.value = Math.max(
      0,
      Math.min(PANEL_MAX_HEIGHT, side.value === 'above' ? above : below),
    );
  }

  function unobserve(): void {
    observer?.disconnect();
    observer = null;
  }

  function observe(): void {
    unobserve();
    if (!bar.value || typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(place);
    observer.observe(bar.value);
  }

  watch(open, (isOpen) => {
    if (!isOpen) {
      unobserve();
      return;
    }
    void nextTick(() => {
      place();
      observe();
    });
  });
  onBeforeUnmount(unobserve);

  return { side, maxHeight };
}
