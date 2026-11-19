import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { i18n } from '@/shared/i18n';
import { INTERPRETER_MODEL } from '@/shared/providers/openai/config';
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

  it('in Interpreter mode keeps the voices in sight but explains they are not used', async () => {
    const settings = useSettingsStore();
    settings.models.translation = INTERPRETER_MODEL;
    const voice = settings.tts.voice;
    const wrapper = mount(VoiceGallery, { global: { plugins: [i18n] } });

    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.interpreter'));
    expect(wrapper.text()).toContain(i18n.global.t('overlay.voice.unusedInInterpreter'));
    const radios = wrapper.findAll('[role="radio"]');
    expect(radios.length).toBeGreaterThan(0);
    expect(radios.every((radio) => radio.attributes('disabled') !== undefined)).toBe(true);
    await radios[1]?.trigger('click');
    expect(settings.tts.voice).toBe(voice);
    wrapper.unmount();
  });
});
