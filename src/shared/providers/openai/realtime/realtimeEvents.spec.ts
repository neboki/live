import { describe, expect, it } from 'vitest';
import { languageOf, sessionUpdate, toUsage } from './realtimeEvents';

const NO_HINTS = { keywords: [], languages: [], topic: '' };

function transcription(update: Record<string, unknown>): Record<string, unknown> {
  const session = update.session as {
    audio: { input: { transcription: Record<string, unknown> } };
  };
  return session.audio.input.transcription;
}

describe('sessionUpdate', () => {
  it('sends only the model when there is nothing to hint', () => {
    expect(transcription(sessionUpdate('gpt-transcribe', 24000, NO_HINTS))).toEqual({
      model: 'gpt-transcribe',
    });
  });

  it('gives newer models keywords, languages, the topic as prompt and, for the live one, a delay', () => {
    const hints = {
      keywords: ['Acme', 'a<b>\nc'],
      languages: ['ES', 'en', 'bad code'],
      topic: ' Wind ',
    };
    expect(transcription(sessionUpdate('gpt-live-transcribe', 24000, hints))).toEqual({
      model: 'gpt-live-transcribe',
      keywords: ['Acme', 'a b  c'],
      prompt: 'Wind',
      languages: ['es', 'en'],
      delay: 'low',
    });
    expect(transcription(sessionUpdate('gpt-transcribe', 24000, hints))).not.toHaveProperty(
      'delay',
    );
  });

  it('puts topic and glossary in one prompt for gpt-4o models, without languages', () => {
    const hints = { keywords: ['SCADA'], languages: ['es'], topic: 'Grid' };
    expect(transcription(sessionUpdate('gpt-4o-mini-transcribe', 24000, hints))).toEqual({
      model: 'gpt-4o-mini-transcribe',
      prompt: 'Grid. Glossary: SCADA',
    });
  });

  it('cuts a topic that is too long', () => {
    const update = sessionUpdate('gpt-transcribe', 24000, { ...NO_HINTS, topic: 'x'.repeat(400) });
    expect(String(transcription(update).prompt)).toHaveLength(300);
  });
});

describe('languageOf', () => {
  it('reads the first language gpt-transcribe lists, as text or object', () => {
    expect(languageOf({ type: 'x', languages: ['es', 'en'] })).toBe('es');
    expect(languageOf({ type: 'x', languages: [{ language: 'fr' }] })).toBe('fr');
  });

  it('falls back to the single language, or nothing', () => {
    expect(languageOf({ type: 'x', languages: [], language: 'de' })).toBe('de');
    expect(languageOf({ type: 'x' })).toBeUndefined();
  });
});

describe('toUsage', () => {
  it('reports the tokens and still the audio seconds sent, for models priced per minute', () => {
    expect(
      toUsage('gpt-transcribe', { type: 'tokens', input_tokens: 120, output_tokens: 8 }, 3.5),
    ).toEqual({
      model: 'gpt-transcribe',
      inputTokens: 120,
      cachedInputTokens: 0,
      outputTokens: 8,
      audioSeconds: 3.5,
    });
  });

  it('prefers the duration the server reports to the seconds counted here', () => {
    expect(toUsage('m', { type: 'duration', seconds: 2 }, 3.5)).toMatchObject({ audioSeconds: 2 });
    expect(toUsage('m', undefined, 3.5)).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      audioSeconds: 3.5,
    });
  });
});
