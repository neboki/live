import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { useOverlayStore } from '../store/useOverlayStore';
import { useCaptionShortcuts } from './useCaptionShortcuts';

const fakes = vi.hoisted(() => ({
  exportSession: vi.fn<() => boolean>(() => true),
  /** The floating window's own window object, as the pip composable would expose it */
  pipWindow: null as { value: Window | null } | null,
}));

vi.mock('@/modules/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/session')>()),
  useExportSession: () => ({ exportSession: fakes.exportSession }),
}));
vi.mock('@/shared/pip/useDocumentPip', async () => {
  const { computed, shallowRef } = await import('vue');
  return {
    createDocumentPip: () => {
      const pipWindow = shallowRef<Window | null>(null);
      fakes.pipWindow = pipWindow;
      return {
        isSupported: true,
        pipWindow,
        pipBody: computed(() => null),
        open: async () => null,
        close: () => (pipWindow.value = null),
      };
    },
  };
});

const Host = defineComponent({
  setup() {
    useCaptionShortcuts();
    return () => h('div');
  },
});

function press(target: EventTarget, code: string, modifiers = true): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { code, ctrlKey: modifiers, shiftKey: modifiers, bubbles: true }),
  );
}

describe('useCaptionShortcuts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });
  afterEach(() => {
    fakes.pipWindow = null;
  });

  it('shows or hides the bar with Ctrl+Shift+Space, and exports with Ctrl+Shift+E', () => {
    const store = useOverlayStore();
    const wrapper = mount(Host);

    press(window, 'Space');
    expect(store.hidden).toBe(true);
    press(window, 'Space');
    expect(store.hidden).toBe(false);
    press(window, 'KeyE');
    expect(fakes.exportSession).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('ignores the keys without both modifiers, and while typing in a field', () => {
    const store = useOverlayStore();
    const wrapper = mount(Host, { attachTo: document.body });
    const input = document.createElement('input');
    document.body.appendChild(input);

    press(window, 'Space', false);
    press(input, 'Space');
    expect(store.hidden).toBe(false);
    press(input, 'KeyE');
    expect(fakes.exportSession).not.toHaveBeenCalled();
    input.remove();
    wrapper.unmount();
  });

  it('listens in the floating window too, and stops when unmounted', async () => {
    const store = useOverlayStore();
    const wrapper = mount(Host);
    const win = document.createElement('div') as unknown as Window;
    if (!fakes.pipWindow) throw new Error('The floating window was not created');
    fakes.pipWindow.value = win;
    await wrapper.vm.$nextTick();

    press(win, 'Space');
    expect(store.hidden).toBe(true);

    wrapper.unmount();
    press(win, 'Space');
    press(window, 'Space');
    expect(store.hidden).toBe(true);
  });
});
