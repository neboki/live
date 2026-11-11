# 0010 — Voice: OpenAI Realtime by default, ElevenLabs optional, no retired models

- **Status:** accepted
- **Date:** 2026-11-11
- **Related:** [0002](0002-openai-single-provider.md), [0003](0003-pricing-and-model-tiers.md),
  [0007](0007-voice-latency.md)

## Context

OpenAI retired every model of its speech endpoint (`/v1/audio/speech`): `gpt-4o-mini-tts`,
`tts-1` and `tts-1-hd` stop working on 2027-01-06. The replacement OpenAI names is
`gpt-realtime-2.1-mini`, which is not a drop-in model: it only runs in a Realtime session.
Its prices (model page, 2026-11-11): text input $0.60 per 1M tokens ($0.06 cached), audio
output $20 per 1M tokens. At about 1,200 audio tokens per minute of speech that is about
$0.024 a minute, about $1 per hour of meeting with voice (39 minutes of speech).

The app must keep working with the OpenAI key alone, so OpenAI's voice stays the default.

ElevenLabs is the reference for natural voices. Checked on 2026-11-11 against its API reference:

- `POST /v1/text-to-speech/{voice_id}/stream` streams raw PCM16 at 24 kHz (`pcm_24000`, every
  plan), which the app's PCM player already plays ([0007](0007-voice-latency.md)).
- The API answers browser requests (`access-control-allow-origin: *`), so it works from the
  static app with the user's own key ([0001](0001-static-web-app.md)).
- It takes `language_code` and `previous_text` (a sentence joins the one before).
- Models: `eleven_flash_v2_5` (about 100 ms, 32 languages, $0.04 per 1K characters),
  `eleven_v4_turbo` (newest, 90+ languages, same price, but only on the Text to Dialogue
  WebSocket), `eleven_multilingual_v2` and `eleven_v4` ($0.08 per 1K characters).
- Its speech-to-speech translation (`/v1/translation/realtime`) is for Enterprise workspaces
  only, so it does not replace the interpreter tier.

## Decision

1. **Two voices, OpenAI's by default.**
   - **OpenAI** (default): a Realtime session with `gpt-realtime-2.1-mini`, keyed like the
     transcription socket (subprotocol on OpenAI, `api-key` on Azure, where the model is the
     deployment name). Each sentence is an out-of-band response (`conversation: "none"`)
     told to say the text word for word; its 24 kHz PCM plays as it arrives. The socket stays
     open between sentences and reopens when key, endpoint, model or voice change (a session
     cannot change voice once it has spoken). Voices: marin (default), cedar and the other
     Realtime voices; fable, nova and onyx no longer exist and fall back to marin.
   - **ElevenLabs** (optional): `eleven_flash_v2_5` on the plain streaming endpoint, with its
     own key asked for in the voice section; the voices come from the user's account.
   - The **browser's** `speechSynthesis` is not offered as a choice (the user's call,
     2026-11-11): it only reads when the chosen voice fails or has no key.
2. **Safety.** If the chosen voice fails (refused key, no credit, network, a model the key
   cannot use), the sentence and the rest of the run are read by the browser voice, with a
   notice. The voice model is left out of the check before a session starts, so a voice
   problem never stops the captions. The ElevenLabs key is remembered like the OpenAI key,
   never backed up or synced, cleared by "Forget key" and redacted from errors.
3. **Cost.** OpenAI's voice reports its tokens per response; ElevenLabs' reports characters
   (`perMillionCharacters` in `pricing.ts`). Both count in the session cost.
4. **No retired models.** `src/shared/providers/retiredModels.ts` lists the models their
   vendors have deprecated, with the shutdown date. A test fails if a quality tier, the
   interpreter or a default uses one. A stored setting that names a retired voice model gets
   the current one; whoever had `gpt-4o-mini-tts` keeps OpenAI's voice, now on the new model.

## Consequences

- ✅ Works with the OpenAI key alone, as before; nothing depends on a model that shuts down.
- ✅ Far more natural voices for whoever adds an ElevenLabs key.
- ✅ A voice failure never stops a session: the browser reads instead.
- ❌ OpenAI's voice costs about twice what `gpt-4o-mini-tts` did (≈ $1 against ≈ $0.45 per
  hour with voice). ElevenLabs costs about $1.50.
- ❌ The OpenAI voice keeps a second WebSocket open while the voice is on.
- ❌ A conversational model reading text could, in rare cases, not say it word for word; the
  instructions forbid answering or translating, and a real-session check is pending.

## Next

- Check in a real session that `gpt-realtime-2.1-mini` reads every sentence word for word, and
  measure its delay to the first sound against ElevenLabs Flash.
- `eleven_v4_turbo` through the Text to Dialogue WebSocket, if a blind test shows it is worth it.
- Scribe v2 Realtime (`scribe_v2_realtime`, $0.22 per hour) as an optional transcriber for the
  low tier: to check Spanish quality, billing basis and its single-use token flow.
