import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { useOverlayStore } from '../../store/useOverlayStore';
import CaptionBar from './CaptionBar.vue';

function mountBar(): VueWrapper {
  return mount(CaptionBar, { global: { plugins: [i18n] } });
}

describe('CaptionBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows the streamed translation word by word', async () => {
    const store = useOverlayStore();
    const wrapper = mountBar();
    store.startTranslation('Hello ');
    store.appendTranslation('world');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.lines__word').map((w) => w.text())).toEqual(['Hello', 'world']);
  });

  it('opens the options menu and switches an extra on', async () => {
    const store = useOverlayStore();
    const wrapper = mountBar();

    await wrapper.get('[aria-controls="lg-menu"]').trigger('click');
    await wrapper.get('[role="switch"]').trigger('click');

    expect(store.options.source).toBe(true);
    expect(wrapper.find('.lines__source').exists()).toBe(true);
  });

  it('only offers to float when the browser supports it', () => {
    const wrapper = mount(CaptionBar, {
      props: { canPopOut: true },
      global: { plugins: [i18n] },
    });

    expect(wrapper.findAll('.bar-header__actions button')).toHaveLength(5);
    expect(mountBar().findAll('.bar-header__actions button')).toHaveLength(4);
  });

  it('closes the options with Escape or a press outside the bar', async () => {
    const wrapper = mount(CaptionBar, { attachTo: document.body, global: { plugins: [i18n] } });
    const toggle = wrapper.get('[aria-controls="lg-menu"]');

    await toggle.trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(toggle.attributes('aria-expanded')).toBe('false');

    await toggle.trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('keeps the sound quick actions in the floating window', () => {
    const store = useOverlayStore();
    store.canHearOriginal = true;
    const popped = mount(CaptionBar, {
      props: { popped: true, live: true, stoppable: true },
      global: { plugins: [i18n] },
    });
    const labels = popped
      .findAll('.bar-header__actions button')
      .map((button) => button.attributes('aria-label'));

    expect(labels).toEqual(
      expect.arrayContaining([
        i18n.global.t('overlay.original'),
        i18n.global.t('overlay.options.voice.label'),
        i18n.global.t('overlay.pause'),
        i18n.global.t('live.stop'),
      ]),
    );
  });

  it('resizes with the arrow keys on its grip, but not in the floating window', async () => {
    const store = useOverlayStore();
    const wrapper = mountBar();
    await wrapper.get('[role="separator"]').trigger('keydown', { key: 'ArrowUp' });
    // jsdom has no layout: the size starts from 0 and is clamped to the minimum
    expect(store.size.height).toBe(64);
    expect(wrapper.get('.lines').classes()).toContain('lines--tall');

    const popped = mount(CaptionBar, { props: { popped: true }, global: { plugins: [i18n] } });
    expect(popped.find('[role="separator"]').exists()).toBe(false);
    expect(popped.find('.bar__edge').exists()).toBe(false);

    const preview = mount(CaptionBar, { props: { resizable: false }, global: { plugins: [i18n] } });
    expect(preview.find('.bar__edge').exists()).toBe(false);
    expect(preview.get('.lines').classes()).not.toContain('lines--tall');
  });

  it('shows a transient notice as a status message', async () => {
    const store = useOverlayStore();
    const wrapper = mountBar();
    store.setNotice('live.reconnecting');
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[role="status"]').text()).toBe(i18n.global.t('live.reconnecting'));
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows a session error as an alert with dismiss and restart', async () => {
    const store = useOverlayStore();
    store.setNotice('errors.rateLimited');
    const wrapper = mount(CaptionBar, {
      props: { live: true, error: 'errors.noCredit' },
      global: { plugins: [i18n] },
    });

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain(i18n.global.t('errors.noCredit'));
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    const [restart, dismiss] = alert.findAll('button');
    await restart?.trigger('click');
    await dismiss?.trigger('click');
    expect(wrapper.emitted('restart')).toHaveLength(1);
    expect(wrapper.emitted('dismiss-error')).toHaveLength(1);
  });

  it('keeps the error visible while minimized', async () => {
    const store = useOverlayStore();
    store.minimized = true;
    const wrapper = mount(CaptionBar, {
      props: { error: 'errors.connectionLost' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it('offers the session cost and forget key only in a live session', async () => {
    const live = mount(CaptionBar, { props: { live: true }, global: { plugins: [i18n] } });
    await live.get('[aria-controls="lg-menu"]').trigger('click');
    expect(live.find('.menu__cost').exists()).toBe(true);
    expect(live.text()).toContain(i18n.global.t('overlay.forgetKey'));

    const demo = mountBar();
    await demo.get('[aria-controls="lg-menu"]').trigger('click');
    expect(demo.find('.menu__cost').exists()).toBe(false);
    expect(demo.text()).not.toContain(i18n.global.t('overlay.forgetKey'));
  });
});

describe('CaptionBar between the page and the floating window', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('offers Stop and Back to the page side by side in the floating window', async () => {
    const wrapper = mount(CaptionBar, {
      props: { popped: true, live: true, stoppable: true },
      global: { plugins: [i18n] },
    });
    const labels = wrapper
      .findAll('.bar-header__actions button')
      .map((button) => button.attributes('aria-label'));

    expect(labels).toEqual(
      expect.arrayContaining([i18n.global.t('live.stop'), i18n.global.t('overlay.popIn')]),
    );

    await wrapper.get(`[aria-label="${i18n.global.t('overlay.popIn')}"]`).trigger('click');
    expect(wrapper.emitted('pop-in')).toHaveLength(1);
    expect(wrapper.emitted('pop-out')).toBeUndefined();
  });

  it('offers Stop and Float side by side in the page', async () => {
    const wrapper = mount(CaptionBar, {
      props: { live: true, stoppable: true, canPopOut: true },
      global: { plugins: [i18n] },
    });

    await wrapper.get(`[aria-label="${i18n.global.t('overlay.popOut')}"]`).trigger('click');
    expect(wrapper.emitted('pop-out')).toHaveLength(1);
    expect(wrapper.find(`[aria-label="${i18n.global.t('live.stop')}"]`).exists()).toBe(true);
  });

  it('fills the page with only Pause, Float and the settings, named', () => {
    const store = useOverlayStore();
    store.canHearOriginal = true;
    store.canSyncVideo = true;
    const wrapper = mount(CaptionBar, {
      props: { live: true, stoppable: true, canPopOut: true, fill: true, resizable: false },
      global: { plugins: [i18n] },
    });

    expect(wrapper.classes()).toContain('bar--fill');
    expect(wrapper.get('.lines').classes()).toContain('lines--tall');
    const names = wrapper.findAll('.bar-header__actions button').map((button) => button.text());
    expect(names).toEqual([
      i18n.global.t('overlay.pause'),
      i18n.global.t('overlay.options.title'),
      i18n.global.t('overlay.float'),
    ]);
    wrapper.unmount();
  });
});
