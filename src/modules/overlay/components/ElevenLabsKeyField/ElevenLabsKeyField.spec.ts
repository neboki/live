import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { i18n } from '@/shared/i18n';
import ElevenLabsKeyField from './ElevenLabsKeyField.vue';

const KEY = 'sk_0123456789abcdef0123456789abcdef';

function voicesResponse(count: number): Response {
  const voices = Array.from({ length: count }, (_, i) => ({
    voice_id: `v${i}`,
    name: `Voice ${i}`,
    category: 'premade',
  }));
  return new Response(JSON.stringify({ voices }), { status: 200 });
}

function mountField(): ReturnType<typeof mount<typeof ElevenLabsKeyField>> {
  return mount(ElevenLabsKeyField, { global: { plugins: [i18n] } });
}

describe('ElevenLabsKeyField', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('explains the steps and links to create a key while empty', () => {
    const wrapper = mountField();
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keySteps'));
    expect(wrapper.find('a[href*="elevenlabs"]').exists()).toBe(true);
    expect(wrapper.find('.eleven__choose').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the key, says how many voices it unlocks and offers to pick one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(voicesResponse(3));
    vi.stubGlobal('fetch', fetchMock);
    const settings = useSettingsStore();
    const wrapper = mountField();

    await wrapper.get('input').setValue(KEY);
    await flushPromises();

    expect(settings.voiceKey).toBe(KEY);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyWorks', { count: 3 }, 3));
    await wrapper.get('.eleven__choose').trigger('click');
    expect(wrapper.emitted('choose')).toHaveLength(1);
    wrapper.unmount();
  });

  it('says so when ElevenLabs refuses the key, without the pick button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const wrapper = mountField();

    await wrapper.get('input').setValue(KEY);
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyRefused'));
    expect(wrapper.find('.eleven__choose').exists()).toBe(false);
    wrapper.unmount();
  });

  it('asks for the whole key when the pasted one is too short, without calling ElevenLabs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountField();

    await wrapper.get('input').setValue('sk_123');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyShort'));
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
