# 0002 — OpenAI as the single default provider

- **Status:** accepted
- **Date:** 2026-10-20

## Context

The app needs streaming speech-to-text with language detection, low-latency translation, a live
summary, reply suggestions and optional text-to-speech. Specialised services (e.g. Deepgram for
speech) can be faster or cheaper, but each extra provider means one more key for the user.

## Decision

Use OpenAI for everything by default:

- Realtime API in transcription mode (WebSocket) for live speech-to-text.
- Chat Completions (streaming) for translation, summary and suggestions.
- Browser `speechSynthesis` for voice, with OpenAI TTS as an option.

All calls go through `SttProvider` and `LlmProvider` interfaces, so other providers can be added
without touching the UI.

## Consequences

- ✅ One key, simplest onboarding.
- ✅ The provider can be swapped later if latency or cost demands it.
- ❌ Dependent on one vendor's availability and pricing.
- ❌ The key is used from the browser. This is acceptable because each user brings their own key;
  it is documented in [SECURITY.md](../../SECURITY.md).
