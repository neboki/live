import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Closes a popover on Escape or on a press outside `root`. Listens on the
 * document that holds `root`, so it also works in the floating window.
 */
export function useDismiss(
  root: Ref<HTMLElement | null>,
  open: Ref<boolean>,
  close: () => void,
): void {
  let doc: Document | null = null;

  function onPointerDown(event: PointerEvent): void {
    // No instanceof: inside the floating window nodes belong to another window
    const target = event.target as Node | null;
    if (target && root.value?.contains(target)) return;
    close();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  }

  function detach(): void {
    doc?.removeEventListener('pointerdown', onPointerDown, true);
    doc?.removeEventListener('keydown', onKeydown, true);
    doc = null;
  }

  function attach(): void {
    detach();
    doc = root.value?.ownerDocument ?? null;
    doc?.addEventListener('pointerdown', onPointerDown, true);
    doc?.addEventListener('keydown', onKeydown, true);
  }

  watch(open, (isOpen) => (isOpen ? attach() : detach()));
  onBeforeUnmount(detach);
}
