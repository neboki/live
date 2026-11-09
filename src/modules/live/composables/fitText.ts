import { nextTick, onBeforeUnmount, onMounted, type Ref, watch, type WatchSource } from 'vue';

/** How far a text may shrink to fit before it scrolls instead */
export const FIT_MIN = 0.4;
const FIT_STEP = 0.06;

/**
 * Shrinks a box's text until all of it shows: sets `--fit` (1 → FIT_MIN) on the box,
 * which its font size multiplies. Past the minimum the box scrolls to its end, so the
 * newest words are the ones on screen.
 */
export function fitText(box: HTMLElement): void {
  let fit = 1;
  box.style.setProperty('--fit', '1');
  while (box.scrollHeight > box.clientHeight + 1 && fit > FIT_MIN) {
    fit = Math.max(FIT_MIN, fit - FIT_STEP);
    box.style.setProperty('--fit', fit.toFixed(2));
  }
  box.scrollTop = box.scrollHeight;
}

/** Keeps the boxes fitted as their text changes and as the screen turns or resizes */
export function useFitText(
  boxes: Ref<HTMLElement | HTMLElement[] | null | undefined>,
  source: WatchSource,
): void {
  // Only a change of box size refits: fitting changes the text, not the box
  const sizes = new WeakMap<Element, string>();
  let observer: ResizeObserver | null = null;

  function all(): HTMLElement[] {
    const value = boxes.value;
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function fitAll(): void {
    all().forEach((box) => {
      fitText(box);
      observer?.observe(box);
    });
  }

  watch(source, async () => {
    await nextTick();
    fitAll();
  });
  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        entries.forEach(({ target, contentRect }) => {
          const size = `${Math.round(contentRect.width)}x${Math.round(contentRect.height)}`;
          if (sizes.get(target) === size) return;
          sizes.set(target, size);
          if (target instanceof HTMLElement) fitText(target);
        });
      });
    }
    fitAll();
  });
  onBeforeUnmount(() => observer?.disconnect());
}
