# 0010 — ElevenLabs for the optional voice, no retired models

- **Status:** accepted
- **Date:** 2026-11-11
- **Related:** [0002](0002-openai-single-provider.md), [0003](0003-pricing-and-model-tiers.md),
  [0007](0007-voice-latency.md)

## Context

OpenAI retired every model of its speech endpoint (`/v1/audio/speech`): `gpt-4o-mini-tts`,
`tts-1` and `tts-1-hd` stop working on 2027-01-06. Its replacement, `gpt-realtime-2.1-mini`,
is not a drop-in model: it only runs in a Realtime session, so the voice would need another
connection, and its price for reading text aloud is not published.

ElevenLabs is the reference for natural voices. Checked on 2026-11-11 against its API reference:

- `POST /v1/text-to-speech/{voice_id}/stream` streams raw PCM16 at 24 kHz (`pcm_24000`, every
  plan), which the app's PCM player already plays ([0007](0007-voice-latency.md)).
- The API answers browser requests (`access-control-allow-origin: *`), so it works from the
  static app with the user's own key, like OpenAI ([0001](0001-static-web-app.md)).
- It takes `language_code` (the voice speaks the right language) and `previous_text` (a
  sentence joins the one before without a reset in tone).
- Models: `eleven_flash_v2_5` (about 100 ms, 32 languages, $0.04 per 1K characters),
  `eleven_v4_turbo` (newest, 90+ languages, same price, but only on the Text to Dialogue
  WebSocket), `eleven_multilingual_v2` and `eleven_v4` ($0.08 per 1K characters, slower).
- Plans include characters (Free about 20K Flash characters, Starter $6 for 150K); usage
  beyond them is billed at the rates above.
- Its speech-to-speech translation (`/v1/translation/realtime`) is for Enterprise workspaces
  only, so it does not replace the interpreter tier.

## Decision

1. **The voice is the browser's (free) or ElevenLabs'.** OpenAI's voice is removed. The
   ElevenLabs key is optional and asked for in the voice section; without it the app runs
   with the OpenAI key alone, as before.
2. **Model `eleven_flash_v2_5`**, on the plain streaming endpoint. `eleven_v4_turbo` is left
   for later: it needs the Text to Dialogue WebSocket.
3. **The voices come from the user's account** (`GET /v2/voices`): their own first, then the
   premade ones. The default id is "George", a premade voice every account has.
4. **Safety.** If ElevenLabs fails (refused key, no credit, network), the sentence and the
   rest of the run are read by the browser voice, with a notice that says why. The key is
   remembered like the OpenAI key, never backed up or synced, cleared by "Forget key" and
   redacted from errors. The app suggests a key limited to text to speech with a credit cap.
5. **Cost.** Usage is reported in characters and priced per character
   (`perMillionCharacters` in `pricing.ts`), so the voice counts in the session cost.
6. **No retired models.** `src/shared/providers/retiredModels.ts` lists the models their
   vendors have deprecated, with the shutdown date. A test fails if a quality tier, the
   interpreter or a default uses one. Stored settings that name a retired voice model fall
   back to the default; whoever had OpenAI's voice gets the browser's.

## Consequences

- ✅ Far more natural voices, sooner (about 100 ms to the first sound), each sentence joined
  to the one before.
- ✅ Nothing depends on a model that shuts down in January.
- ✅ Without an ElevenLabs key nothing changes.
- ❌ A second key and a second account for whoever wants the voice.
- ❌ The voice costs more than OpenAI's did: about $1.50 per hour of meeting with voice
  (39 minutes of speech, about 39K characters), against about $0.45.
- ❌ One more service receives data (the translated text), so the privacy page and the CSP
  list ElevenLabs.

## Next

- `eleven_v4_turbo` through the Text to Dialogue WebSocket, if a blind test shows it is worth it.
- Scribe v2 Realtime (`scribe_v2_realtime`, $0.22 per hour) as an optional transcriber for the
  low tier: text while people speak, at a lower price. To check first: Spanish quality,
  whether it bills audio sent or time connected, and its single-use token flow.
