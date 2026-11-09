import { SCALE_RANGE, useOverlayStore } from '@/modules/overlay';

/** A−/A+ on the live screens: the text size the user picked, kept in the overlay settings */
export function useTextScale(): { bigger: () => void; smaller: () => void } {
  const overlay = useOverlayStore();
  const set = (delta: number): void => {
    const next = Math.round((overlay.scale + delta) * 100) / 100;
    overlay.scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, next));
  };
  return { bigger: () => set(SCALE_RANGE.step), smaller: () => set(-SCALE_RANGE.step) };
}
