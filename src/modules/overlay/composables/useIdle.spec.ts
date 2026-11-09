import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { useIdle } from './useIdle';

function mountIdle(
  source: Ref<number>,
  delayMs?: number,
): { idle: Ref<boolean>; unmount: () => void } {
  const holder: { idle: Ref<boolean> | null } = { idle: null };
  const Host = defineComponent({
    setup() {
      holder.idle = useIdle([source], delayMs);
      return () => h('div');
    },
  });
  const wrapper = mount(Host);
  if (!holder.idle) throw new Error('useIdle not called');
  return { idle: holder.idle, unmount: () => wrapper.unmount() };
}

describe('useIdle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('becomes idle after the delay without changes', () => {
    const { idle } = mountIdle(ref(0), 1000);

    expect(idle.value).toBe(false);
    vi.advanceTimersByTime(999);
    expect(idle.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(idle.value).toBe(true);
  });

  it('wakes up and restarts the countdown when a source changes', async () => {
    const source = ref(0);
    const { idle } = mountIdle(source, 1000);
    vi.advanceTimersByTime(1000);
    expect(idle.value).toBe(true);

    source.value++;
    await nextTick();
    expect(idle.value).toBe(false);
    vi.advanceTimersByTime(500);
    expect(idle.value).toBe(false);
    vi.advanceTimersByTime(500);
    expect(idle.value).toBe(true);
  });

  it('uses 3.5 s by default', () => {
    const { idle } = mountIdle(ref(0));

    vi.advanceTimersByTime(3499);
    expect(idle.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(idle.value).toBe(true);
  });

  it('clears its timer on unmount', () => {
    const { unmount } = mountIdle(ref(0), 1000);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
