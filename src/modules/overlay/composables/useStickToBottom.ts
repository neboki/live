import { nextTick, onBeforeUnmount, ref, watch, type Ref, type WatchSource } from 'vue';

export interface StickToBottom {
  /** The user scrolled up to read something earlier: new text must not pull them away */
  detached: Ref<boolean>;
  /** Back to the newest line, and following it again */
  scrollToEnd: (smooth?: boolean) => void;
}

/** How close to the bottom still counts as "at the bottom", in CSS pixels */
const STICKY_SLACK = 24;
/** Gestures that can only come from the user: they decide before any scroll event lands */
const USER_EVENTS = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;

/**
 * Keeps a scrolling list at its newest (bottom) line while new text arrives,
 * like a chat, until the user scrolls up; then it stays put until they come back
 * to the bottom or ask to jump there.
 */
export function useStickToBottom(
  el: Ref<HTMLElement | null>,
  sources: WatchSource[],
): StickToBottom {
  const detached = ref(false);
  /** Scroll events are ours until the user touches the list again */
  let following = true;

  function distanceToEnd(box: HTMLElement): number {
    return box.scrollHeight - box.scrollTop - box.clientHeight;
  }

  function scrollToEnd(smooth = false): void {
    const box = el.value;
    if (!box) return;
    detached.value = false;
    following = true;
    if (smooth) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
    else box.scrollTop = box.scrollHeight;
  }

  // No instanceof: inside the floating window the event belongs to another window
  function onUserGesture(event: Event): void {
    following = false;
    const box = el.value;
    const wheelUp = 'deltaY' in event && (event as WheelEvent).deltaY < 0;
    // Scrolling up with the wheel detaches at once, before new text can pull the list down
    if (wheelUp && box && box.scrollHeight > box.clientHeight) detached.value = true;
  }

  function onScroll(): void {
    const box = el.value;
    if (!box || following) return;
    detached.value = distanceToEnd(box) > STICKY_SLACK;
    if (!detached.value) following = true;
  }

  function listen(box: HTMLElement): void {
    box.addEventListener('scroll', onScroll, { passive: true });
    for (const type of USER_EVENTS) box.addEventListener(type, onUserGesture, { passive: true });
  }

  function unlisten(box: HTMLElement): void {
    box.removeEventListener('scroll', onScroll);
    for (const type of USER_EVENTS) box.removeEventListener(type, onUserGesture);
  }

  watch(
    el,
    (box, old) => {
      if (old) unlisten(old);
      if (box) listen(box);
    },
    { immediate: true },
  );
  watch(sources, () => {
    if (detached.value) return;
    void nextTick(() => {
      if (!detached.value) scrollToEnd();
    });
  });
  onBeforeUnmount(() => {
    if (el.value) unlisten(el.value);
  });

  return { detached, scrollToEnd };
}
