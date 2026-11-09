import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { setTheme } from '@/shared/theme/theme';
import UiThemeSelect from './UiThemeSelect.vue';

describe('UiThemeSelect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    setTheme('system');
  });

  it('offers system, light and dark, and applies the choice to the page', async () => {
    const wrapper = mount(UiThemeSelect, { global: { plugins: [i18n] } });
    const select = wrapper.get<HTMLSelectElement>('select');

    expect([...select.element.options].map((o) => o.value)).toEqual(['system', 'light', 'dark']);
    await select.setValue('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(wrapper.text()).toContain(i18n.global.t('nav.theme.dark'));
    wrapper.unmount();
  });
});
