// "Translate a voice note": the app plays an audio file (a WhatsApp voice note, a
// recording) and listens to it as it plays, so it is subtitled the way a talk would be.
// The file is decoded and played with Web Audio, which every phone browser supports,
// and the same sound is handed to the session as the stream to listen to.

import { logError } from '@/shared/errors';
import { useLiveSession } from '../store/useLiveSession';

/** After the last word, time for the last sentence to be transcribed and translated */
const TAIL_MS = 1500;

let context: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;

/**
 * Opens the audio output during the tap that opens the file picker: picking a file may
 * not count as a tap any more, and phones only let a page make sound from one.
 */
export function prepareVoiceNote(): void {
  try {
    if (!context || context.state === 'closed') context = new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  } catch (err) {
    logError('Could not open the audio output for a voice note', err);
  }
}

/** Stops the voice note playing, if any */
export function stopVoiceNote(): void {
  const source = playing;
  playing = null;
  if (!source) return;
  source.onended = null;
  try {
    source.stop();
  } catch {
    // Already stopped.
  }
}

/**
 * Plays `file` with subtitles in `target`. Resolves false when the file could not be
 * decoded or the session did not start (the session then says why).
 */
export async function playVoiceNote(file: File, target: string): Promise<boolean> {
  prepareVoiceNote();
  const ctx = context;
  if (!ctx) return false;
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch (err) {
    logError('Could not decode the voice note', err);
    return false;
  }
  const session = useLiveSession();
  stopVoiceNote();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const out = ctx.createMediaStreamDestination();
  source.connect(ctx.destination);
  source.connect(out);
  const started = await session.start(target, { mode: 'audio', stream: out.stream });
  if (!started) return true;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  playing = source;
  source.onended = (): void => {
    if (playing !== source) return;
    playing = null;
    setTimeout(() => {
      if (session.active && session.mode === 'audio') session.stop();
    }, TAIL_MS);
  };
  source.start();
  return true;
}
