// Models their vendor has deprecated or shut down. The app must never pick one of these by
// itself: retiredModels.spec.ts fails if a tier, the interpreter or a default uses one.
// Add a model here as soon as its deprecation is announced, with the date it stops working.

/** Model id → the day it stops working (ISO date), from the vendor's deprecations page */
export const RETIRED_MODELS: Readonly<Record<string, string>> = {
  // OpenAI, https://developers.openai.com/api/docs/deprecations (checked 2026-11-11)
  'gpt-4o-mini-tts': '2027-01-06',
  'tts-1': '2027-01-06',
  'tts-1-hd': '2027-01-06',
  'gpt-4o-mini-transcribe': '2027-02-26',
  'gpt-4o': '2027-01-14',
  'gpt-4o-mini': '2027-01-14',
  'gpt-4.1': '2027-01-14',
  'gpt-4.1-mini': '2027-01-14',
  'gpt-4.1-nano': '2026-10-23',
  'gpt-5': '2026-12-11',
  'gpt-5-mini': '2026-12-11',
  'gpt-5-nano': '2026-12-11',
  // ElevenLabs, https://elevenlabs.io/docs/models (checked 2026-11-11)
  eleven_turbo_v2_5: 'deprecated',
  eleven_turbo_v2: 'deprecated',
  eleven_multilingual_v1: 'deprecated',
  scribe_v1: 'deprecated',
};

/** The date suffix of a snapshot: "-2025-03-20" */
const SNAPSHOT = /^-\d{4}-\d{2}-\d{2}$/;

/** True when `model` (or a dated snapshot of it, "gpt-4o-mini-tts-2025-03-20") is retired */
export function isRetiredModel(model: string): boolean {
  const id = model.trim();
  return Object.keys(RETIRED_MODELS).some(
    (retired) =>
      id === retired || (id.startsWith(`${retired}-`) && SNAPSHOT.test(id.slice(retired.length))),
  );
}
