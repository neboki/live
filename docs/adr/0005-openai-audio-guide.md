# 0005 — What we take from OpenAI's audio guide

- **Status:** proposed
- **Date:** 2026-10-22
- **Related:** [0002](0002-openai-single-provider.md) (provider), [0003](0003-pricing-and-model-tiers.md) (tiers and prices)

## Context

OpenAI's [audio guide](https://developers.openai.com/api/docs/guides/audio) and the guides it
links (live transcription, live translation, text to speech, voice latency and cost) show
three things that affect Neboki Live:

- `gpt-4o-mini-transcribe` (the Low cost tier) shuts down on 2027-02-26, and `gpt-4o-mini-tts`
  (OpenAI voice) on 2027-01-06.
- Live transcription takes hints we did not send: `languages`, a `prompt` describing the
  recording, and a `delay` that trades speed against accuracy (`gpt-live-transcribe` only).
- `gpt-realtime-translate` turns speech into translated text **and** translated speech in one
  session, while people speak, without waiting for a pause.

GPT-Live, speech-to-speech Realtime agents, audio in Chat Completions and SIP are for
assistants that answer, not for captions, so they are left out.

## Decision

1. **Low cost tier: `gpt-transcribe`** ($0.0045/min; the tier goes from ≈ $0.17 to ≈ $0.24 per
   hour). It takes `keywords`, uses earlier sentences as context and reports the language of
   each sentence, so text already in the target language is no longer translated.
2. **Meeting hints.** Settings get an optional topic and up to four expected languages. They go
   to the transcriber when a session starts: `prompt` and `languages` for current models, one
   text prompt for gpt-4o ones. `gpt-live-transcribe` gets `delay: "low"`.
3. **Voice gallery.** The voice setting becomes a gallery: the browser voice (free) and the 13
   OpenAI voices, each with a sample to hear first. The default OpenAI voice is `marin`.
   `gpt-4o-mini-tts` stays until it shuts down; its replacement (`gpt-realtime-2.1-mini`)
   uses the Realtime API and is a separate change.
4. **Interpreter tier.** A fourth quality level uses `gpt-realtime-translate`
   (`wss://api.openai.com/v1/realtime/translations`). Captions come from its translated text,
   a line closing at a sentence end or a pause; its voice is played as it arrives, and nothing
   else reads the captions aloud. Summary and suggestions still use `gpt-6-luna` on the
   original text. Without a target language the session falls back to `gpt-live-transcribe`.

## Consequences

- ✅ No tier depends on a model that shuts down in February 2027.
- ✅ Better transcription of names and mixed languages, at no cost.
- ✅ A natural voice for those who want to listen instead of read.
- ❌ The interpreter costs ≈ $2.07 per hour: it must be sent the silences too, so the whole
  hour is billed ($0.034/min), against ≈ 44 billed minutes in the other tiers.
- ❌ The interpreter takes no glossary, and is not offered on Azure.
- ❌ Voice samples are small OpenAI requests billed to the user's key.

## To validate before release

1. **Browser auth for the interpreter.** The guide documents ephemeral client secrets from a
   server. The app sends the key in the WebSocket subprotocol, as it does for transcription;
   this must be checked with a real key. If OpenAI rejects it, the interpreter needs a small backend
   that issues ephemeral tokens.
2. A blind test of the interpreter's translation against `gpt-6-luna` and `gpt-6.1-sol`, with
   names, numbers and code-switching.
3. The `delay` level on real meetings (`low` against `minimal` and `medium`).
4. Whether `gpt-transcribe` reports its language as text or as objects (both are read).

## Update (2026-11-04): long silences are held back

The interpreter still gets every pause it needs to close a sentence, but after 20 s in a row
without speech (`INTERPRETER_IDLE_HOLD_MS`) the audio is held on the device and only the last
second is kept. When someone speaks again that second goes first, then the live audio. A
meeting with long quiet stretches (a break, a screen being shared in silence) stops costing
$0.034 a minute while nothing is said.

**To validate with a real key:** that the translation session stays open through a silence of
several minutes with no audio appended. If OpenAI closes it, the existing reconnect brings it
back, but the first words after the silence would then arrive late.
