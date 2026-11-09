import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import App from './App.vue';

describe('App', () => {
  it('opens on the start screen with the key field', () => {
    const wrapper = mount(App, { global: { plugins: [createPinia(), i18n] } });

    expect(wrapper.find('.start').exists()).toBe(true);
    expect(wrapper.find('#lg-api-key').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the settings off the start screen, on a page of their own', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia(), i18n] } });
    expect(wrapper.find('.settings-panel').exists()).toBe(false);

    const item = wrapper
      .findAll('.shell__item')
      .find((el) => el.text() === i18n.global.t('nav.settings'));
    await item?.trigger('click');
    await flushPromises();

    expect(wrapper.find('.settings-view .menu--page').exists()).toBe(true);
    expect(wrapper.find('.start').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the privacy page from the menu, in place of the start screen', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia(), i18n] } });

    const item = wrapper
      .findAll('.shell__item')
      .find((el) => el.text() === i18n.global.t('nav.privacy'));
    await item?.trigger('click');
    await flushPromises();

    expect(wrapper.find('.privacy-view').exists()).toBe(true);
    expect(wrapper.find('.start').exists()).toBe(false);
    expect(window.location.pathname).toBe('/privacy');
    window.history.replaceState(null, '', '/');
    wrapper.unmount();
  });

  it('opens the privacy page from the consent note on the start screen', async () => {
    const wrapper = mount(App, { global: { plugins: [createPinia(), i18n] } });

    await wrapper.find('.start__consent a').trigger('click');
    await flushPromises();

    expect(wrapper.find('.privacy-view').exists()).toBe(true);
    window.history.replaceState(null, '', '/');
    wrapper.unmount();
  });
});
