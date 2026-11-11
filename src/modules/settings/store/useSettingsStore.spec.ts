import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { MODELS, TIER_MODELS } from '@/shared/providers/openai/config';
import { DEFAULT_TTS, useSettingsStore } from './useSettingsStore';
import { fakeOpenAiKey } from '@/shared/testing/keys.fakes';

const KEY = fakeOpenAiKey('FAKE_0123456789abcdefghij');
/** Shaped like an ElevenLabs key, built at runtime so no key-like text sits in the repo */
const VOICE_KEY = ['sk', 'fake0123456789abcdefghij'].join('_');
const stored = (key: string): string | null => window.localStorage.getItem(`neboki-live:${key}`);
const store = (key: string, value: string): void =>
  window.localStorage.setItem(`neboki-live:${key}`, value);

function freshStore(): ReturnType<typeof useSettingsStore> {
  setActivePinia(createPinia());
  return useSettingsStore();
}

describe('useSettingsStore', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  describe('spending limit', () => {
    it('has none by default, and persists and restores a positive amount', async () => {
      const settings = freshStore();
      expect(settings.spendLimitEur).toBeNull();
      settings.spendLimitEur = 2.5;
      await nextTick();
      expect(stored('spend-limit')).toBe('2.5');
      expect(freshStore().spendLimitEur).toBe(2.5);
    });

    it('treats zero, negative or unreadable amounts as no limit', async () => {
      store('spend-limit', 'abc');
      const settings = freshStore();
      expect(settings.spendLimitEur).toBeNull();
      settings.spendLimitEur = -1;
      await nextTick();
      expect(settings.spendLimitEur).toBeNull();
      expect(stored('spend-limit')).toBeNull();
    });
  });

  describe('API key (SEC-2)', () => {
    it('remembers the trimmed key by default', async () => {
      const settings = freshStore();
      settings.apiKey = `  ${KEY}  `;
      await nextTick();

      expect(settings.remember).toBe(true);
      expect(stored('openai-key')).toBe(KEY);
      expect(stored('remember-key')).toBeNull();
    });

    it('restores a remembered key on load', () => {
      store('openai-key', KEY);

      expect(freshStore().apiKey).toBe(KEY);
    });

    it('restores a key saved while remembering was opt-in', () => {
      store('remember-key', 'true');
      store('openai-key', KEY);

      expect(freshStore().apiKey).toBe(KEY);
    });

    it('ignores a stored key once the user turned remember off', () => {
      store('remember-key', 'false');
      store('openai-key', KEY);

      const settings = freshStore();
      expect(settings.remember).toBe(false);
      expect(settings.apiKey).toBe('');
    });

    it('removes the stored key when remember is turned off', async () => {
      const settings = freshStore();
      settings.apiKey = KEY;
      await nextTick();
      settings.remember = false;
      await nextTick();

      expect(stored('openai-key')).toBeNull();
      expect(stored('remember-key')).toBe('false');
      expect(settings.apiKey).toBe(KEY);
    });

    it('forgetKey clears memory and the stored key at once', async () => {
      const settings = freshStore();
      settings.apiKey = KEY;
      settings.voiceKey = VOICE_KEY;
      await nextTick();
      expect(stored('elevenlabs-key')).toBe(VOICE_KEY);

      settings.forgetKey();

      expect(settings.apiKey).toBe('');
      expect(settings.voiceKey).toBe('');
      expect(stored('elevenlabs-key')).toBeNull();
      expect(settings.remember).toBe(false);
      expect(stored('openai-key')).toBeNull();
      expect(stored('remember-key')).toBe('false');
    });

    it('flags keys that do not look like OpenAI keys', () => {
      const settings = freshStore();
      settings.apiKey = 'not-a-key';
      expect(settings.keyLooksValid).toBe(false);
      settings.apiKey = KEY;
      expect(settings.keyLooksValid).toBe(true);
    });

    it('survives storage that throws', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });

      const settings = freshStore();

      expect(settings.apiKey).toBe('');
      expect(settings.models).toEqual(MODELS);
      expect(settings.tts).toEqual(DEFAULT_TTS);
    });
  });

  describe('models', () => {
    it('defaults to the provider models', () => {
      expect(freshStore().models).toEqual(MODELS);
    });

    it('persists changes and restores them', async () => {
      const settings = freshStore();
      settings.models.translation = 'gpt-custom';
      await nextTick();

      expect(JSON.parse(stored('models') ?? '{}')).toMatchObject({ translation: 'gpt-custom' });
      expect(freshStore().models.translation).toBe('gpt-custom');
    });

    it('falls back to defaults for corrupt or partial data', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      store('models', '{not json');
      expect(freshStore().models).toEqual(MODELS);

      store('models', JSON.stringify({ summary: 'gpt-x', translation: 42, suggestions: '  ' }));
      expect(freshStore().models).toEqual({ ...MODELS, summary: 'gpt-x' });
    });

    it('resetModels restores the defaults', async () => {
      const settings = freshStore();
      settings.models.summary = 'other';
      settings.resetModels();
      await nextTick();

      expect(settings.models).toEqual(MODELS);
      expect(JSON.parse(stored('models') ?? '{}')).toEqual(MODELS);
    });
  });

  describe('quality tier', () => {
    it('starts on medium, with captions while people speak', () => {
      expect(freshStore().tier).toBe('medium');
    });

    it('applyTier sets every model of the tier and persists them', async () => {
      const settings = freshStore();
      settings.applyTier('premium');
      await nextTick();

      expect(settings.models).toEqual(TIER_MODELS.premium);
      expect(settings.tier).toBe('premium');
      expect(freshStore().tier).toBe('premium');
    });

    it('is null when a model was changed by hand', () => {
      const settings = freshStore();
      settings.applyTier('medium');
      settings.models.summary = 'gpt-custom';

      expect(settings.tier).toBeNull();
    });
  });

  describe('tts', () => {
    it('defaults to the OpenAI voice', () => {
      expect(freshStore().tts).toEqual({
        engine: 'openai',
        model: 'gpt-realtime-2.1-mini',
        voice: 'marin',
        elevenLabsModel: 'eleven_flash_v2_5',
        elevenLabsVoice: 'JBFqnCBsd6RMkjVDRZzb',
      });
    });

    it('persists changes and restores them', async () => {
      const settings = freshStore();
      settings.tts.engine = 'elevenlabs';
      settings.tts.elevenLabsVoice = 'voice-id';
      await nextTick();

      expect(freshStore().tts).toEqual({
        ...DEFAULT_TTS,
        engine: 'elevenlabs',
        elevenLabsVoice: 'voice-id',
      });
    });

    it('rejects an unknown engine', () => {
      store('tts', JSON.stringify({ engine: 'robot', voice: 'cedar' }));

      expect(freshStore().tts).toEqual({ ...DEFAULT_TTS, voice: 'cedar' });
    });

    it('gives whoever had picked the browser voice the default one', () => {
      store('tts', JSON.stringify({ engine: 'browser', voice: 'cedar' }));

      expect(freshStore().tts).toEqual({ ...DEFAULT_TTS, voice: 'cedar' });
    });

    it('moves whoever had the retired OpenAI voice model to the current one', () => {
      store('tts', JSON.stringify({ engine: 'openai', model: 'gpt-4o-mini-tts', voice: 'cedar' }));

      expect(freshStore().tts).toEqual({ ...DEFAULT_TTS, voice: 'cedar' });
    });

    it('replaces a voice the Realtime models lack, and keeps an Azure deployment name', () => {
      store('tts', JSON.stringify({ engine: 'openai', model: 'my-voice', voice: 'nova' }));

      expect(freshStore().tts).toEqual({ ...DEFAULT_TTS, model: 'my-voice' });
    });

    it('replaces a retired ElevenLabs model with the default one', () => {
      store('tts', JSON.stringify({ engine: 'elevenlabs', elevenLabsModel: 'eleven_turbo_v2_5' }));

      expect(freshStore().tts).toEqual({ ...DEFAULT_TTS, engine: 'elevenlabs' });
    });

    it('never stores the key alongside the preferences', async () => {
      const settings = freshStore();
      settings.apiKey = KEY;
      settings.voiceKey = VOICE_KEY;
      settings.tts.voice = 'verse';
      settings.models.summary = 'x';
      await nextTick();

      expect(stored('tts')).not.toContain(KEY);
      expect(stored('tts')).not.toContain(VOICE_KEY);
      expect(stored('models')).not.toContain(KEY);
    });
  });
  describe('Azure OpenAI', () => {
    const AZURE_KEY = 'a'.repeat(84);

    it('defaults to OpenAI, with no endpoint for the providers', () => {
      const settings = freshStore();
      expect(settings.provider).toBe('openai');
      expect(settings.endpoint).toBeUndefined();
    });

    it('needs an Azure key and a valid endpoint', () => {
      const settings = freshStore();
      settings.provider = 'azure';
      settings.apiKey = AZURE_KEY;
      expect(settings.keyLooksValid).toBe(false);
      settings.azureEndpoint = 'https://example.com';
      expect(settings.keyLooksValid).toBe(false);
      settings.azureEndpoint = 'https://my-res.openai.azure.com';
      expect(settings.keyLooksValid).toBe(true);
      settings.apiKey = KEY;
      expect(settings.keyLooksValid).toBe(false);
    });

    it('keeps only the origin and persists provider and endpoint', async () => {
      const settings = freshStore();
      settings.provider = 'azure';
      settings.azureEndpoint = 'https://my-res.openai.azure.com/openai/v1/';
      await nextTick();
      await nextTick();

      expect(settings.endpoint).toBe('https://my-res.openai.azure.com');
      expect(stored('provider')).toBe('azure');
      expect(stored('azure-endpoint')).toBe('https://my-res.openai.azure.com');
      expect(freshStore().endpoint).toBe('https://my-res.openai.azure.com');
    });

    it('ignores an unknown stored provider', () => {
      store('provider', 'other');
      expect(freshStore().provider).toBe('openai');
    });
  });
});
