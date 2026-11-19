import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useVoiceEngine } from './useVoiceEngine';

const overlay = reactive({
  options: { voice: true },
  selfVoiced: false,
  translation: { asHeard: false },
  voiceEngine: null as 'openai' | 'elevenlabs' | 'browser' | null,
  voiceProblem: null as string | null,
});
const settings = reactive({
  apiKey: 'openai-key',
  voiceKey: 'eleven-key',
  tts: { engine: 'openai' as 'openai' | 'elevenlabs' },
});

vi.mock('../store/useOverlayStore', () => ({ useOverlayStore: () => overlay }));
vi.mock('@/modules/settings', () => ({ useSettingsStore: () => settings }));

describe('useVoiceEngine', () => {
  beforeEach(() => {
    overlay.options.voice = true;
    overlay.selfVoiced = false;
    overlay.translation.asHeard = false;
    overlay.voiceEngine = null;
    overlay.voiceProblem = null;
    settings.apiKey = 'openai-key';
    settings.voiceKey = 'eleven-key';
    settings.tts.engine = 'openai';
  });

  it('shows nothing while the voice is off', () => {
    overlay.options.voice = false;
    expect(useVoiceEngine().value).toBeNull();
  });

  it('names the chosen engine before anything is read', () => {
    const engine = useVoiceEngine();
    expect(engine.value).toEqual({ name: 'openai', reason: null });
    settings.tts.engine = 'elevenlabs';
    expect(engine.value).toEqual({ name: 'elevenlabs', reason: null });
  });

  it('says OpenAI reads, and why, when ElevenLabs is chosen without its key', () => {
    settings.tts.engine = 'elevenlabs';
    settings.voiceKey = '';
    expect(useVoiceEngine().value).toEqual({
      name: 'openai',
      reason: 'overlay.voiceTag.noElevenLabsKey',
    });
  });

  it('says the browser reads, and why, without any key', () => {
    settings.apiKey = '';
    const engine = useVoiceEngine();
    expect(engine.value).toEqual({ name: 'browser', reason: 'overlay.voiceTag.noOpenAiKey' });
    settings.tts.engine = 'elevenlabs';
    settings.voiceKey = '';
    expect(engine.value).toEqual({
      name: 'browser',
      reason: 'overlay.voiceTag.noElevenLabsKey',
    });
  });

  it('says the browser took over after ElevenLabs failed, with its reason', () => {
    settings.tts.engine = 'elevenlabs';
    overlay.voiceEngine = 'browser';
    overlay.voiceProblem = 'errors.ttsUnusual';
    expect(useVoiceEngine().value).toEqual({ name: 'browser', reason: 'errors.ttsUnusual' });
  });

  it('says no voice reads a line shown as said', () => {
    overlay.translation.asHeard = true;
    expect(useVoiceEngine().value).toEqual({ name: 'asHeard', reason: null });
  });

  it('names the interpreter when the translator speaks by itself', () => {
    overlay.selfVoiced = true;
    expect(useVoiceEngine().value).toEqual({ name: 'interpreter', reason: null });
  });
});
