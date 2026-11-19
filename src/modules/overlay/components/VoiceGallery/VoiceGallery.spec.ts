import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { i18n } from '@/shared/i18n';
import { DEFAULT_TIER, INTERPRETER_MODEL } from '@/shared/providers/openai/config';
import { useOverlayStore } from '../../store/useOverlayStore';
import VoiceGallery from './VoiceGallery.vue';

describe('VoiceGallery', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('turns the voice on when a voice is picked, so the choice is heard', async () => {
    const overlay = useOverlayStore();
    const settings = useSettingsStore();
    overlay.options.voice = false;
    const wrapper = mount(VoiceGallery, { global: { plugins: [i18n] } });

    await wrapper.findAll('[role="radio"]')[1]?.trigger('click');

    expect(overlay.options.voice).toBe(true);
    expect(settings.tts.engine).toBe('openai');
    expect(settings.tts.voice).toBe('cedar');
    wrapper.unmount();
  });

  it('shows the ElevenLabs group without a key, saying the key unlocks its voices', () => {
    const wrapper = mount(VoiceGallery, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.elevenlabs'));
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.needsElevenLabsKey'));
    wrapper.unmount();
  });

  it('in Interpreter mode marks no voice, and picking one leaves Interpreter so it reads', async () => {
    const settings = useSettingsStore();
    settings.applyTier('interpreter');
    expect(settings.models.translation).toBe(INTERPRETER_MODEL);
    const wrapper = mount(VoiceGallery, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.interpreter'));
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.unusedInInterpreter'));
    const radios = wrapper.findAll('[role="radio"]');
    expect(radios.length).toBeGreaterThan(0);
    expect(radios.every((radio) => radio.attributes('aria-checked') === 'false')).toBe(true);
    await radios[1]?.trigger('click');
    expect(settings.tier).toBe(DEFAULT_TIER);
    expect(settings.tts.engine).toBe('openai');
    expect(radios[1]?.attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });
});
