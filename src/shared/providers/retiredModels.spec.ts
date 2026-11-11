import { describe, expect, it } from 'vitest';
import { DEFAULT_TTS } from '@/modules/settings/store/useSettingsStore';
import { DEFAULT_VOICE_MODEL } from './elevenlabs/config';
import { INTERPRETER_MODEL, INTERPRETER_SOURCE_MODEL, TIER_MODELS } from './openai/config';
import { isRetiredModel } from './retiredModels';

describe('retired models', () => {
  it('knows a retired model and its dated snapshots, and nothing else', () => {
    expect(isRetiredModel('gpt-4o-mini-tts')).toBe(true);
    expect(isRetiredModel('gpt-4o-mini-tts-2025-03-20')).toBe(true);
    expect(isRetiredModel('gpt-4.1')).toBe(true);
    expect(isRetiredModel('gpt-4o-mini-transcribe-x')).toBe(false);
    expect(isRetiredModel('gpt-4x1')).toBe(false);
    expect(isRetiredModel('gpt-live-transcribe')).toBe(false);
  });

  it('are used by no quality tier, nor by the interpreter', () => {
    const models = [
      ...Object.values(TIER_MODELS).flatMap((tier) => Object.values(tier)),
      INTERPRETER_MODEL,
      INTERPRETER_SOURCE_MODEL,
    ];
    expect(models.filter(isRetiredModel)).toEqual([]);
  });

  it('are not the default voice', () => {
    expect(isRetiredModel(DEFAULT_VOICE_MODEL)).toBe(false);
    expect(isRetiredModel(DEFAULT_TTS.model)).toBe(false);
    expect(isRetiredModel(DEFAULT_TTS.elevenLabsModel)).toBe(false);
  });
});
