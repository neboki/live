import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { i18n } from '@/shared/i18n';
import { useOverlayStore } from '../../store/useOverlayStore';
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

function radios(wrapper: ReturnType<typeof mountField>): {
  openai: ReturnType<typeof wrapper.get>;
  eleven: ReturnType<typeof wrapper.get>;
} {
  const [, openai, eleven] = wrapper.findAll('[role="radio"]');
  if (!openai || !eleven) throw new Error('engine radios missing');
  return { openai, eleven };
}

describe('ElevenLabsKeyField', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('says plainly that OpenAI reads, without an ElevenLabs key box under it', () => {
    useOverlayStore().options.voice = true;
    const wrapper = mountField();

    expect(radios(wrapper).openai.attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain(
      i18n.global.t('overlay.voice.usingOpenAi', { voice: 'Marin' }),
    );
    expect(wrapper.find('input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the ElevenLabs key, labelled, only under ElevenLabs, and OpenAI keeps reading', async () => {
    const settings = useSettingsStore();
    const overlay = useOverlayStore();
    overlay.options.voice = true;
    const wrapper = mountField();

    await radios(wrapper).eleven.trigger('click');

    expect(radios(wrapper).eleven.attributes('aria-checked')).toBe('true');
    expect(wrapper.get('label').text()).toBe(i18n.global.t('overlay.voice.keyLabel'));
    expect(wrapper.find('a[href*="elevenlabs"]').exists()).toBe(true);
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.needsElevenLabsKeyMeanwhile'));
    expect(settings.tts.engine).toBe('openai');
    expect(overlay.options.voice).toBe(true);

    await radios(wrapper).openai.trigger('click');
    expect(wrapper.find('input').exists()).toBe(false);
    wrapper.unmount();
  });

  it('marks No voice, not OpenAI, while the voice is off, and turns it off from there', async () => {
    const overlay = useOverlayStore();
    overlay.options.voice = false;
    const wrapper = mountField();
    const off = wrapper.findAll('[role="radio"]')[0];

    expect(off?.attributes('aria-checked')).toBe('true');
    expect(radios(wrapper).openai.attributes('aria-checked')).toBe('false');
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.usingNone'));

    await radios(wrapper).openai.trigger('click');
    expect(overlay.options.voice).toBe(true);
    await off?.trigger('click');
    expect(overlay.options.voice).toBe(false);
    wrapper.unmount();
  });

  it('switches to ElevenLabs, voice on, once a typed key works', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(voicesResponse(3)));
    const settings = useSettingsStore();
    const overlay = useOverlayStore();
    overlay.options.voice = false;
    settings.tts.elevenLabsVoice = 'v1';
    const wrapper = mountField();

    await radios(wrapper).eleven.trigger('click');
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.needsElevenLabsKey'));
    await wrapper.get('input').setValue(KEY);
    await flushPromises();

    expect(settings.voiceKey).toBe(KEY);
    expect(settings.tts.engine).toBe('elevenlabs');
    expect(overlay.options.voice).toBe(true);
    expect(radios(wrapper).eleven.attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain(
      i18n.global.t('overlay.voice.usingElevenLabs', { voice: 'Voice 1' }),
    );
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyWorks', { count: 3 }, 3));

    await radios(wrapper).openai.trigger('click');
    expect(settings.tts.engine).toBe('openai');
    wrapper.unmount();
  });

  it('keeps OpenAI when ElevenLabs refuses the key, and will not switch to it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const settings = useSettingsStore();
    const wrapper = mountField();

    await radios(wrapper).eleven.trigger('click');
    await wrapper.get('input').setValue(KEY);
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyRefused'));
    expect(settings.tts.engine).toBe('openai');
    wrapper.unmount();
  });

  it('accepts a key restricted to text to speech and offers the standard voices', async () => {
    const body =
      '{"detail":{"status":"missing_permissions","message":"The API key you used is missing the permission voices_read to execute this operation."}}';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 401 })));
    const settings = useSettingsStore();
    const overlay = useOverlayStore();
    overlay.options.voice = false;
    const wrapper = mountField();

    await radios(wrapper).eleven.trigger('click');
    await wrapper.get('input').setValue(KEY);
    await flushPromises();

    expect(wrapper.text()).not.toContain(i18n.global.t('overlay.voice.keyRefused'));
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyLimited'));
    expect(settings.tts.engine).toBe('elevenlabs');
    expect(overlay.options.voice).toBe(true);
    expect(wrapper.text()).toContain(
      i18n.global.t('overlay.voice.usingElevenLabs', { voice: 'George' }),
    );
    wrapper.unmount();
  });

  it('asks for the whole key when it is too short, without calling ElevenLabs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountField();

    await radios(wrapper).eleven.trigger('click');
    await wrapper.get('input').setValue('sk_123');
    await flushPromises();

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.keyShort'));
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
