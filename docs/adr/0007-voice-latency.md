# 0007 — Voice latency: an interpreter that never falls behind

- **Status:** accepted
- **Date:** 2026-10-26
- **Related:** [0005](0005-openai-audio-guide.md) (interpreter tier)

## Context

In the Interpreter tier the delay people notice is the one of the voice. Beyond the model's
own latency, three things in the app made it longer, and one of them for good:

- Audio captured before the interpreter was connected (up to 5 s) and while it reconnected
  (up to 10 s) was sent in one go once the socket was up. The interpreter hears that
  backlog late and says it late, and the voice stayed that far behind for the rest of the
  session.
- The voice player kept a 50 ms cushion before the first chunk: any network jitter above
  that opened a gap, and after the gap the next chunk started again with a cushion. It only
  recovered a backlog by skipping ahead once it was 4 s behind, without cancelling what was
  already scheduled, so the old and the new audio overlapped.
- In the other tiers OpenAI's voice downloaded the whole mp3 of a sentence before playing
  it, about a second after the translation was finished.

OpenAI's translation guide says to send audio continuously, silence included, and that the
engine works on 200 ms frames; a frame completes at the same moment whether it arrives as
two 100 ms chunks or one of 200 ms, so the capture chunk size was not changed.

## Decision

1. **The interpreter skips what it missed.** At most 2 s of audio heard before it was
   connected (`MAX_PENDING_CHUNKS`) or while reconnecting (`INTERPRETER_BACKLOG_SECONDS`)
   is sent; older audio is dropped. The transcription tiers keep their 10 s: a transcriber
   catches up with a backlog, an interpreter cannot.
2. **The player catches up like an interpreter does.** `pcmPlayer` keeps a 150 ms cushion
   at the start of every stretch of audio (`LEAD_SECONDS`), plays 12 % faster while more
   than 1 s is queued until less than 0.4 s is left, and only past 3 s cuts what is queued
   and skips ahead.
3. **OpenAI voice streams.** `/audio/speech` is asked for raw PCM (24 kHz) and the reply
   is fed to the same player as it arrives; the first word plays with the first chunk.
   Usage is reported from the samples received (the text estimate only for a cut clip).
4. **The voice starts on each sentence.** In the tiers that translate with a text model,
   `useVoiceOutput` reads a sentence as soon as its end and the next word have streamed in
   (`spokenUpTo`), and what is left once the line is done, instead of waiting for the whole
   line: a line of several sentences is heard while it is still being written.

## Consequences

- ✅ The voice stays within the model's own latency plus the cushion, whatever happened to
  the connection; it never lags behind for good.
- ✅ The first spoken word of each sentence in the other tiers arrives about a second
  earlier (streaming) and, in a line of several sentences, as soon as its sentence is
  complete; the volume applies while a sentence plays.
- ❌ Up to 2 s of speech are lost at the start and after a drop, as with an interpreter who
  joins late.
- ❌ The 12 % faster speech while catching up is audible to an attentive listener.
- `blob:` in the CSP's `media-src` is no longer needed by the voice and stays as a harmless
  leftover.
