# 0008 — Video sync: the shared tab a few seconds behind, in step with the captions

- **Status:** accepted
- **Date:** 2026-10-26
- **Related:** [0007](0007-voice-latency.md) (voice latency)

## Context

A caption shows a few seconds after its sentence was said: the sentence has to end, the
transcriber has to settle and the translation has to stream in. Watching the call in the
shared tab, the user reads each caption while the speaker is already on the next sentence.
Live television solves this by holding the picture back; a web page cannot hold another
tab back, but it can play a copy of it.

Chrome silences a shared tab when it is captured with `suppressLocalAudioPlayback`, and
the page already plays that tab's sound itself (`originalMonitor`), so the page owns what
the user hears of it. With the tab's picture it can own what they see of it too.

## Decision

1. **The page plays the tab behind time.** With the "picture in step with the captions"
   option on, the shared tab's video and audio tracks are recorded in 250 ms chunks
   (`MediaRecorder`) and fed to a video element through Media Source Extensions; the
   playhead is kept the wanted delay behind the end of the buffer (`delayedPlayback`).
   The buffer stays in segments mode: the recording's own timestamps place each chunk,
   where sequence mode re-times every append and puts clicks and gaps in the sound.
   Falling behind the wanted delay is made up by playing 4 % faster, far behind by
   jumping; a delay that grows past what is buffered holds the picture until it is there
   (never slowed down: time-stretched speech is what sounds like a bad connection). The
   live sound of the tab is muted meanwhile. Media more than 20 s behind the playhead is
   dropped. Only a silenced tab with a picture, in a browser that can record and play
   `video/webm`, offers the option (`canSyncVideo`).
   The user can pause the picture like a recording; resumed, it goes on from there,
   further behind, with its captions, until "back in step" jumps to the wanted delay. A
   pause long enough to fill the buffer catches up by itself.
2. **The delay follows the captions.** The delay is the measured caption latency (from a
   sentence heard to its first translated word) plus 1.5 s of headroom, rounded up to the
   half second, between 2 and 15 s, and 4 s before the first measure. It only moves once
   the latency has moved a full second, so the picture is not forever drifting
   (`utils/sync.ts`).
3. **The captions follow the picture.** Under the picture the page lists the session's
   lines whose sentence the delayed picture has reached (its start when known, otherwise
   its end). The floating window keeps showing the captions live: the delayed ones are a
   second reading, in the page, for whoever watches there.
4. **It is a preference.** The option is remembered with the other bar preferences; each
   session offers it only while its share allows it, and a failure to start the delay
   withdraws it for that session.

## Consequences

- ✅ Watching in the page, each caption lands on its sentence; the sound comes with it.
- ✅ Nothing changes for the transcription or the floating window: the delayed picture is
  a copy, fed from the same share.
- ❌ The user has to watch the page instead of the original tab, which keeps playing
  silently; the first picture takes the whole delay to appear, and a growing delay
  pauses it.
- ❌ Recording the tab costs CPU (VP8 at up to 2.5 Mb/s) and about 20 s of memory.
- ❌ The translated voice, when on, still speaks ahead of the delayed picture.
- Screen and window shares, which Chrome does not silence, cannot be synced.
