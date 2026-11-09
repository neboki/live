import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { SessionLine } from '@/modules/session';
import { i18n } from '@/shared/i18n';
import type { DelayedPlayback } from '@/shared/media/delayedPlayback';
import SyncedTab from './SyncedTab.vue';

function fakePlayback(): DelayedPlayback {
  return {
    element: document.createElement('video'),
    lagSeconds: () => null,
    paused: () => false,
    pause: vi.fn(),
    resume: vi.fn(),
    wait: vi.fn(),
    waiting: () => false,
    catchUp: vi.fn(),
    setDelay: vi.fn(),
    setVolume: vi.fn(),
    stop: vi.fn(),
  };
}

function line(at: number, translation: string, source = 'heard'): SessionLine {
  return { at, source, translation };
}

describe('SyncedTab', () => {
  it('puts the playback element in the frame and says the picture is being held back', () => {
    const playback = fakePlayback();
    const wrapper = mount(SyncedTab, {
      props: { playback, delaySeconds: 4, lagSeconds: null, paused: false, lines: [] },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('.synced-tab__frame').element.firstChild).toBe(playback.element);
    expect(wrapper.text()).toContain(i18n.global.t('live.sync.buffering', { seconds: 4 }));
    expect(wrapper.find('.synced-tab__lines').exists()).toBe(false);
    // The controls show while there is nothing to play yet, and nothing can be paused
    expect(wrapper.classes()).toContain('synced-tab--chrome');
    expect(wrapper.find('.synced-tab__pause').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.synced-tab__catch-up').exists()).toBe(false);
    wrapper.unmount();
  });

  it('asks to press play in the shared tab while it sends no sound, above the buffering note', async () => {
    const wrapper = mount(SyncedTab, {
      props: {
        playback: fakePlayback(),
        delaySeconds: 4,
        lagSeconds: null,
        paused: false,
        lines: [],
      },
      global: { plugins: [i18n] },
    });
    const buffering = i18n.global.t('live.sync.buffering', { seconds: 4 });
    expect(wrapper.text()).not.toContain(i18n.global.t('live.tabSilent'));

    await wrapper.setProps({ silent: true });
    expect(wrapper.find('[role="status"]').text()).toBe(i18n.global.t('live.tabSilent'));
    expect(wrapper.text()).not.toContain(buffering);

    await wrapper.setProps({ silent: false });
    expect(wrapper.text()).toContain(buffering);
    wrapper.unmount();
  });

  it('pauses and resumes the picture, and offers to catch up when it is far behind', async () => {
    const playback = fakePlayback();
    const wrapper = mount(SyncedTab, {
      props: { playback, delaySeconds: 4, lagSeconds: 4.2, paused: false, lines: [] },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.synced-tab__catch-up').exists()).toBe(false);

    await wrapper.find('.synced-tab__pause').trigger('click');
    expect(playback.pause).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ paused: true, lagSeconds: 9 });
    expect(wrapper.find('.synced-tab__big').exists()).toBe(true);
    expect(wrapper.find('.synced-tab__catch-up').text()).toContain('−9.0 s');
    expect(wrapper.find('.synced-tab__pause').attributes('aria-label')).toBe(
      i18n.global.t('live.sync.resume'),
    );
    await wrapper.find('.synced-tab__pause').trigger('click');
    expect(playback.resume).toHaveBeenCalledTimes(1);

    // Going on from there, 5 s further behind than the delay: offered to catch up
    await wrapper.setProps({ paused: false, lagSeconds: 9 });
    await wrapper.find('.synced-tab__catch-up').trigger('click');
    expect(playback.catchUp).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ lagSeconds: 4.5 });
    expect(wrapper.find('.synced-tab__catch-up').exists()).toBe(false);
    wrapper.unmount();
  });

  it('pauses and resumes when the picture itself is clicked, once there is something to play', async () => {
    const playback = fakePlayback();
    const wrapper = mount(SyncedTab, {
      props: { playback, delaySeconds: 4, lagSeconds: null, paused: false, lines: [] },
      global: { plugins: [i18n] },
    });
    const surface = wrapper.find('.synced-tab__surface');
    expect(surface.attributes('disabled')).toBeDefined();

    await wrapper.setProps({ lagSeconds: 4 });
    expect(surface.attributes('aria-label')).toBe(i18n.global.t('live.sync.pause'));
    await surface.trigger('click');
    expect(playback.pause).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ paused: true });
    expect(surface.attributes('aria-label')).toBe(i18n.global.t('live.sync.resume'));
    await surface.trigger('click');
    expect(playback.resume).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('shows the lag and the last reached lines, the newest as the current one', async () => {
    const wrapper = mount(SyncedTab, {
      props: {
        playback: fakePlayback(),
        delaySeconds: 4,
        lagSeconds: 3.96,
        paused: false,
        lines: [
          line(Date.now() - 7000, 'one'),
          line(Date.now() - 6000, 'two'),
          line(Date.now() - 5000, 'three'),
          line(Date.now() - 4500, '', 'as heard'),
        ],
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('.synced-tab__live--on').text()).toContain('−4.0 s');
    const lines = wrapper.findAll('.synced-tab__line');
    expect(lines.map((el) => el.text())).toEqual(['three', 'as heard']);
    expect(lines.at(-1)?.classes()).toContain('synced-tab__line--current');

    // A new playback (the delay was rebuilt) takes the frame
    const next = fakePlayback();
    await wrapper.setProps({ playback: next });
    expect(wrapper.find('.synced-tab__frame').element.firstChild).toBe(next.element);
    wrapper.unmount();
  });
});

describe('SyncedTab as a player', () => {
  it('lets a line leave the picture a while after its sentence ended', () => {
    const wrapper = mount(SyncedTab, {
      props: {
        playback: fakePlayback(),
        delaySeconds: 4,
        lagSeconds: 4,
        paused: false,
        lines: [line(Date.now() - 20_000, 'long gone')],
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.synced-tab__lines').exists()).toBe(false);
    wrapper.unmount();
  });

  it('answers the keys of a video player and hides the captions on request', async () => {
    const playback = fakePlayback();
    const wrapper = mount(SyncedTab, {
      props: {
        playback,
        delaySeconds: 4,
        lagSeconds: 4,
        paused: false,
        lines: [line(Date.now() - 4000, 'hola')],
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('.synced-tab__lines').text()).toBe('hola');

    await wrapper.trigger('keydown', { key: ' ' });
    await wrapper.trigger('keydown', { key: 'k' });
    expect(playback.pause).toHaveBeenCalledTimes(2);

    await wrapper.trigger('keydown', { key: 'c' });
    expect(wrapper.find('.synced-tab__lines').exists()).toBe(false);
    expect(wrapper.find('.synced-tab__cc').attributes('aria-pressed')).toBe('false');
    await wrapper.find('.synced-tab__cc').trigger('click');
    expect(wrapper.find('.synced-tab__lines').exists()).toBe(true);
    wrapper.unmount();
  });
});
