import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { i18n } from '@/shared/i18n';
import ApiKeyField from './ApiKeyField.vue';
import { fakeOpenAiKey } from '@/shared/testing/keys.fakes';

const KEY = fakeOpenAiKey();

function mountField(): ReturnType<typeof mount> {
  return mount(ApiKeyField, { global: { plugins: [i18n] } });
}

const AZURE_KEY = '0123456789abcdef0123456789abcdef';

describe('ApiKeyField', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('offers to remember the key on this device, on by default', async () => {
    const settings = useSettingsStore();
    const wrapper = mountField();
    const box = wrapper.get<HTMLInputElement>('input[type="checkbox"]');

    expect(box.element.checked).toBe(true);
    expect(wrapper.text()).toContain(i18n.global.t('start.key.remember'));

    await box.setValue(false);
    expect(settings.remember).toBe(false);
    wrapper.unmount();
  });

  it('offers Azure OpenAI, with its endpoint, and judges the key by the provider', async () => {
    const settings = useSettingsStore();
    const wrapper = mountField();
    expect(wrapper.find('#lg-azure-endpoint').exists()).toBe(false);

    await wrapper.findAll('[role="radio"]')[1]?.trigger('click');
    expect(settings.provider).toBe('azure');
    await wrapper.get('input[type="password"]').setValue(AZURE_KEY);
    expect(settings.keyLooksValid).toBe(false);
    expect(wrapper.text()).toContain(i18n.global.t('start.key.endpoint.help'));

    await wrapper.get('#lg-azure-endpoint').setValue('https://acme.openai.azure.com/openai/');
    expect(settings.endpoint).toBe('https://acme.openai.azure.com');
    expect(settings.keyLooksValid).toBe(true);

    await wrapper.get('#lg-azure-endpoint').setValue('https://example.com');
    expect(wrapper.text()).toContain(i18n.global.t('start.key.endpoint.invalid'));
    expect(settings.keyLooksValid).toBe(false);
    wrapper.unmount();
  });

  it('lets the user remember a key again after forgetting one', async () => {
    const settings = useSettingsStore();
    settings.apiKey = KEY;
    settings.forgetKey();
    const wrapper = mountField();
    const box = wrapper.get<HTMLInputElement>('input[type="checkbox"]');
    expect(box.element.checked).toBe(false);

    await box.setValue(true);
    await wrapper.get('input[type="password"]').setValue(KEY);

    expect(settings.remember).toBe(true);
    expect(window.localStorage.getItem('neboki-live:openai-key')).toBe(KEY);
    wrapper.unmount();
  });
});
