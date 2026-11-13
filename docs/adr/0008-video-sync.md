# 0008 — Video sync: the shared tab a few seconds behind, in step with the captions

- **Status:** accepted
- **Date:** 2026-10-26 (revised 2026-11-13)
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
   Once playing it is left alone at normal speed; only a real slip of more than 2 s (a
   stall, a hidden tab) is corrected, by one jump. A recording can have gaps (a tab that
   stops painting sends no frames): the playhead starts past them and jumps over the ones
   it runs into at once, instead of standing in them. The live sound of the tab is muted
   meanwhile. Media more than 20 s behind the playhead is dropped. Only a silenced tab
   with a picture, in a browser that can record and play `video/webm`, offers the option
   (`canSyncVideo`).
   The user can pause the picture like a recording; resumed, it goes on from there,
   further behind, with its captions, until "back in step" jumps to the wanted delay. A
   pause long enough to fill the buffer catches up by itself.
2. **The picture never stops for a caption; the delay is known beforehand.** _(Revised
   2026-11-13. Before, the delay was measured from the first three captions while the
   picture waited, raised later with a hold, and an optional "wait" paused the picture
   for every late caption. Measured in a real browser on a shared tab, those holds froze
   the picture 11 to 55 s out of every 80; without them, up to 40 % of the captions
   landed seconds late. Seven delay policies in eight days had only ever been checked
   with fakes.)_ On "auto", the default, the delay is 15 s from the first frame. About 8 s is what a
   caption needs when all goes well: the
   longest sentence the audio gate lets through (4 s), its transcript (about 1 s), the
   first translated words (under 1 s, 2.5 s when the request was doubled); the rest is
   room for a slow network, since on a video being further behind costs nothing.
   Nothing is measured while the picture waits, and nothing in the controller can pause
   the picture or make it jump. Only when two of the last six captions still land late
   is the delay raised to cover them, and the picture gets there by playing 5 % slower
   (pitch kept, at the threshold where a change of tempo starts to be noticed), still
   without stopping; it is never lowered. A caption that is late simply shows as soon as
   it exists. The user can instead pick a fixed delay (3–30 s), which stays as chosen,
   and is then offered a longer one when captions keep landing late (`utils/sync.ts`,
   `watchers/videoSync.ts`). The "wait" option is gone. In development the player traces
   every seek, glide and stall of the element in the console as `[sync]`.
3. **The captions follow the picture, from their first words.** On the picture the page
   shows the session's lines whose sentence the delayed picture has reached (its start
   when known, otherwise its end), and also the caption still being written: its
   translated words show where its sentence began as they arrive, instead of waiting for
   the whole line (`captionComing` in the pipeline). That takes the length of the
   translation out of what the delay has to cover. The floating window keeps showing the
   captions live: the delayed ones are a second reading, in the page, for whoever
   watches there.
4. **It is a preference.** The option is remembered with the other bar preferences; each
   session offers it only while its share allows it, and a failure to start the delay
   withdraws it for that session.

## Consequences

- ✅ Watching in the page, each caption lands on its sentence; the sound comes with it.
- ✅ Nothing changes for the transcription or the floating window: the delayed picture is
  a copy, fed from the same share.
- ❌ The user has to watch the page instead of the original tab, which keeps playing
  silently; the first picture takes the whole delay (15 s on auto) to appear.
- ✅ The flow has a browser test with the real recorder and buffer
  (`tests/e2e/sync.spec.ts`): it fails when the picture pauses or stands still.
- ✅ A tab whose picture stands still (slides) plays like any other: a shared tab only
  sends a frame when something changes, and a recording without frames cannot be played,
  sound included (measured: the player never started). What is recorded is therefore a
  copy of the picture repainted 24 times a second (`steadyPicture`), at the cost of one
  canvas draw per frame. While the app's own tab is hidden its timers slow down and the
  copy with them.
- ❌ Recording the tab costs CPU (VP8 at up to 2.5 Mb/s) and about 20 s of memory.
- ✅ The translated voice follows the picture too: while it plays behind time, each line is
  read when the picture reaches its sentence, and one it has left behind is skipped
  (`overlay/composables/pictureVoice.ts`). The interpreter tier, whose voice comes from the
  model as it speaks, still runs ahead of the picture.
- Screen and window shares, which Chrome does not silence, cannot be synced.
