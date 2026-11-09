import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '@/shared/i18n';
import UiLocaleSelect from './UiLocaleSelect.vue';

describe('UiLocaleSelect', () => {
  afterEach(() => {
    setLocale('en');
    localStorage.clear();
  });

  it('lists every supported language named in itself', () => {
    const wrapper = mount(UiLocaleSelect, { global: { plugins: [i18n] } });
    const labels = wrapper.findAll('option').map((option) => option.text());

    expect(labels).toEqual(['English', 'Español']);
    wrapper.unmount();
  });

  it('switches the interface language and remembers it', async () => {
    const wrapper = mount(UiLocaleSelect, { global: { plugins: [i18n] } });

    await wrapper.find('select').setValue('es');

    expect(i18n.global.locale.value).toBe('es');
    expect(localStorage.getItem('neboki-live:locale')).toBe('es');
    expect(wrapper.find('.ui-lang__value').text()).toBe('Español');
    wrapper.unmount();
  });
});
