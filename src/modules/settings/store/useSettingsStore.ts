import { defineStore } from 'pinia';
import { computed, reactive, ref, watch } from 'vue';
import { AUDIO_SOURCES, canShareScreen, type AudioSource } from '@/shared/audio/audioSources';
import {
  DEFAULT_TIER,
  QUALITY_TIERS,
  TIER_MODELS,
  type QualityTier,
} from '@/shared/providers/openai/config';
import { DEFAULT_VOICE_ID, DEFAULT_VOICE_MODEL } from '@/shared/providers/elevenlabs/config';
import { normalizeAzureEndpoint } from '@/shared/providers/openai/endpoint';
import { isRetiredModel } from '@/shared/providers/retiredModels';
import type { TtsEngine, TtsSettings } from '@/shared/speech/types';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { defaultTargetLanguage, isLanguageChoice } from '../languages';
import { isLikelyAzureKey, isLikelyOpenAiKey, normalizeApiKey } from '../utils/apiKey';
import { type MeetingHints, parseMeeting } from './meetingHints';

/** Who serves the models: OpenAI itself or the user's Azure OpenAI resource */
export type ApiProvider = 'openai' | 'azure';
export type ModelRole = 'transcription' | 'translation' | 'summary' | 'suggestions';
export type ModelSettings = Record<ModelRole, string>;
/** Voice types live in the speech module; re-exported for settings consumers. */
export type { TtsEngine, TtsSettings };
export type { QualityTier };

const STORAGE_API_KEY = 'openai-key';
const STORAGE_VOICE_KEY = 'elevenlabs-key';
const STORAGE_REMEMBER = 'remember-key';
const STORAGE_MODELS = 'models';
const STORAGE_TTS = 'tts';
const STORAGE_PROVIDER = 'provider';
const STORAGE_AZURE_ENDPOINT = 'azure-endpoint';
const STORAGE_TARGET_LANGUAGE = 'target-language';
const STORAGE_SPEND_LIMIT = 'spend-limit';
const STORAGE_MEETING = 'meeting';
const STORAGE_AUDIO_SOURCE = 'audio-source';
const STORAGE_MIC_DEVICE = 'mic-device';

const MODEL_ROLES: readonly ModelRole[] = [
  'transcription',
  'translation',
  'summary',
  'suggestions',
];
const TTS_ENGINES: readonly TtsEngine[] = ['browser', 'elevenlabs'];
export const API_PROVIDERS: readonly ApiProvider[] = ['openai', 'azure'];

/** The browser's free voice until the user adds an ElevenLabs key (ADR 0010) */
export const DEFAULT_TTS: Readonly<TtsSettings> = {
  engine: 'browser',
  model: DEFAULT_VOICE_MODEL,
  voice: DEFAULT_VOICE_ID,
};
/** ElevenLabs model ids; anything else stored (OpenAI's retired voice) is replaced */
const ELEVENLABS_MODEL = /^eleven_[a-z0-9_]+$/;

function defaultModels(): ModelSettings {
  return { ...TIER_MODELS[DEFAULT_TIER] };
}

/** The tier whose models are all in use, or null when the user mixed or typed their own */
function matchTier(models: ModelSettings): QualityTier | null {
  return (
    QUALITY_TIERS.find((tier) =>
      MODEL_ROLES.every((role) => models[role] === TIER_MODELS[tier][role]),
    ) ?? null
  );
}

/** Parses a stored JSON object; anything unreadable counts as nothing stored. */
function readJson(key: string): Record<string, unknown> {
  const raw = readStorage(key);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (err) {
    console.warn(`[Neboki Live] Ignoring unreadable "${key}" settings`, err);
    return {};
  }
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function loadModels(): ModelSettings {
  const stored = readJson(STORAGE_MODELS);
  const models = defaultModels();
  for (const role of MODEL_ROLES) models[role] = nonEmptyString(stored[role]) ?? models[role];
  return models;
}

/**
 * The stored voice. OpenAI's voice was retired (ADR 0010): whoever had it chosen gets the
 * browser's voice, and its model and voice names give way to ElevenLabs' defaults.
 */
function loadTts(): TtsSettings {
  const stored = readJson(STORAGE_TTS);
  const engine = TTS_ENGINES.find((candidate) => candidate === stored.engine);
  const model = nonEmptyString(stored.model);
  const voice = engine === 'elevenlabs' ? nonEmptyString(stored.voice) : null;
  return {
    engine: engine ?? DEFAULT_TTS.engine,
    model:
      model && ELEVENLABS_MODEL.test(model) && !isRetiredModel(model) ? model : DEFAULT_TTS.model,
    voice: voice ?? DEFAULT_TTS.voice,
  };
}

/** The stored source; without a share dialog (phones) only the microphone can work */
function loadAudioSource(): AudioSource {
  const stored = readStorage(STORAGE_AUDIO_SOURCE);
  const source = AUDIO_SOURCES.find((candidate) => candidate === stored) ?? 'tab';
  return source !== 'mic' && !canShareScreen() ? 'mic' : source;
}

function loadProvider(): ApiProvider {
  const stored = readStorage(STORAGE_PROVIDER);
  return API_PROVIDERS.find((candidate) => candidate === stored) ?? 'openai';
}

/** A positive amount of euros, or null for no limit */
export function toSpendLimit(value: unknown): number | null {
  const amount = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** Remembering is on unless the user turned it off ("false" is stored then) */
function loadRemember(): boolean {
  return readStorage(STORAGE_REMEMBER) !== 'false';
}

function writeKey(key: string, keep: boolean): void {
  writeStorage(STORAGE_REMEMBER, keep ? null : 'false');
  writeStorage(STORAGE_API_KEY, keep && key ? key.trim() : null);
}

/** The ElevenLabs key follows the same "remember on this device" choice as the main key */
function writeVoiceKey(key: string, keep: boolean): void {
  writeStorage(STORAGE_VOICE_KEY, keep && key ? key.trim() : null);
}

/**
 * The user's own API key, remembered on this device unless they turn that off
 * (then kept in memory only), plus provider, Azure endpoint, model and voice preferences, which are not
 * secret and always persisted. On Azure the model names are deployment names.
 */
export const useSettingsStore = defineStore('settings', () => {
  const remember = ref(loadRemember());
  const apiKey = ref(remember.value ? (readStorage(STORAGE_API_KEY) ?? '') : '');
  /** Optional: the user's ElevenLabs key, only for the voice */
  const voiceKey = ref(remember.value ? (readStorage(STORAGE_VOICE_KEY) ?? '') : '');
  const provider = ref<ApiProvider>(loadProvider());
  const azureEndpoint = ref(readStorage(STORAGE_AZURE_ENDPOINT) ?? '');
  /** What the providers take: undefined means OpenAI itself */
  const endpoint = computed(() => (provider.value === 'azure' ? azureEndpoint.value : undefined));
  const endpointLooksValid = computed(
    () => provider.value !== 'azure' || normalizeAzureEndpoint(azureEndpoint.value) !== null,
  );
  const keyLooksValid = computed(() =>
    provider.value === 'azure'
      ? isLikelyAzureKey(apiKey.value) && endpointLooksValid.value
      : isLikelyOpenAiKey(apiKey.value),
  );
  const models = reactive<ModelSettings>(loadModels());
  const tts = reactive<TtsSettings>(loadTts());
  const tier = computed(() => matchTier(models));
  /**
   * Language the captions are translated into (ISO 639-1), or ORIGINAL_LANGUAGE to
   * only transcribe; can change mid-session
   */
  const stored = readStorage(STORAGE_TARGET_LANGUAGE);
  const targetLanguage = ref(isLanguageChoice(stored) ? stored : defaultTargetLanguage());
  /** Euros a session may cost before it stops on its own; null: no limit */
  const spendLimitEur = ref<number | null>(toSpendLimit(readStorage(STORAGE_SPEND_LIMIT)));
  /** Languages and topic of the meeting, for a more accurate transcription */
  const meeting = reactive<MeetingHints>(parseMeeting(readJson(STORAGE_MEETING)));
  /** What a session listens to: a shared tab, the room's microphone, or both */
  const audioSource = ref<AudioSource>(loadAudioSource());
  /** Chosen microphone; empty for the system default */
  const micDeviceId = ref(readStorage(STORAGE_MIC_DEVICE) ?? '');

  function forgetKey(): void {
    apiKey.value = '';
    voiceKey.value = '';
    remember.value = false;
    // Written right away, not on the next tick, so nothing is left behind if the tab closes
    writeKey('', false);
    writeVoiceKey('', false);
  }

  function resetModels(): void {
    Object.assign(models, defaultModels());
  }

  function applyTier(value: QualityTier): void {
    Object.assign(models, TIER_MODELS[value]);
  }

  // A pasted key often carries line breaks or quotes that would fail the format check
  watch(apiKey, (key) => {
    const clean = normalizeApiKey(key);
    if (clean !== key) apiKey.value = clean;
  });
  watch([apiKey, remember], ([key, keep]) => writeKey(key, keep));
  watch(voiceKey, (key) => {
    const clean = normalizeApiKey(key);
    if (clean !== key) voiceKey.value = clean;
  });
  watch([voiceKey, remember], ([key, keep]) => writeVoiceKey(key, keep));
  // The portal URL may carry a path ("/openai/v1/"); only the origin is kept
  watch(azureEndpoint, (value) => {
    const origin = normalizeAzureEndpoint(value);
    if (origin && origin !== value) azureEndpoint.value = origin;
    writeStorage(STORAGE_AZURE_ENDPOINT, value.trim() ? (origin ?? value.trim()) : null);
  });
  watch(provider, (value) => writeStorage(STORAGE_PROVIDER, value === 'openai' ? null : value));
  watch(models, (value) => writeStorage(STORAGE_MODELS, JSON.stringify(value)), { deep: true });
  watch(tts, (value) => writeStorage(STORAGE_TTS, JSON.stringify(value)), { deep: true });
  watch(targetLanguage, (value) => writeStorage(STORAGE_TARGET_LANGUAGE, value));
  watch(meeting, (value) => writeStorage(STORAGE_MEETING, JSON.stringify(value)), {
    deep: true,
  });
  watch(audioSource, (value) => writeStorage(STORAGE_AUDIO_SOURCE, value === 'tab' ? null : value));
  watch(micDeviceId, (value) => writeStorage(STORAGE_MIC_DEVICE, value || null));
  watch(spendLimitEur, (value) => {
    const limit = toSpendLimit(value);
    if (limit !== value) spendLimitEur.value = limit;
    writeStorage(STORAGE_SPEND_LIMIT, limit === null ? null : String(limit));
  });

  return {
    apiKey,
    voiceKey,
    remember,
    provider,
    azureEndpoint,
    endpoint,
    endpointLooksValid,
    keyLooksValid,
    models,
    tts,
    tier,
    targetLanguage,
    spendLimitEur,
    meeting,
    audioSource,
    micDeviceId,
    forgetKey,
    resetModels,
    applyTier,
  };
});
