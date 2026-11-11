import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '@/modules/settings/store/useSettingsStore';
import { i18n } from '@/shared/i18n';
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
});
