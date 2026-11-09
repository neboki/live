import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { useOverlayStore } from '../../store/useOverlayStore';
import SettingsPanel from './SettingsPanel.vue';

describe('SettingsPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows the bar menu in the page, in the page colours and without opacity', () => {
    const store = useOverlayStore();
    store.theme = 'ocean';
    const wrapper = mount(SettingsPanel, { global: { plugins: [i18n] } });

    // A card of the page, not a slab of the bar's dark glass
    expect(wrapper.classes()).not.toContain('settings-panel--theme-ocean');
    expect(wrapper.find('.menu').exists()).toBe(true);
    // The bar lives in an opaque window: the opacity slider would change nothing
    expect(wrapper.text()).not.toContain(i18n.global.t('overlay.look.opacity'));
    wrapper.unmount();
  });

  it('says where the options apply: beside the window by default, elsewhere on request', () => {
    const byDefault = mount(SettingsPanel, { global: { plugins: [i18n] } });
    expect(byDefault.text()).toContain(i18n.global.t('live.options.hint'));
    byDefault.unmount();

    const onPage = mount(SettingsPanel, {
      props: { hint: 'settingsPage.intro' },
      global: { plugins: [i18n] },
    });
    expect(onPage.text()).toContain(i18n.global.t('settingsPage.intro'));
    onPage.unmount();
  });

  it('drives the same store as the bar: a toggle here is a toggle there', async () => {
    const store = useOverlayStore();
    const wrapper = mount(SettingsPanel, { global: { plugins: [i18n] } });
    const before = store.options.voice;

    const voice = wrapper
      .findAll('[role="switch"]')
      .find((el) => el.text().includes(i18n.global.t('overlay.options.voice.label')));
    await voice?.trigger('click');

    expect(store.options.voice).toBe(!before);
    wrapper.unmount();
  });
});
