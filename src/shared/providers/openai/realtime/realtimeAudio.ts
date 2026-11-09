// The audio side of a transcription session: queues captured chunks (also while
// reconnecting) and turns them into append/commit events through the silence gate,
// so silence outside a sentence is never sent nor billed.

import { mergePcm, pcmToBase64 } from '@/shared/audio/pcm';
import { createSilenceGate } from '@/shared/audio/silenceGate';
import { createVoiceprintMeter, type Voiceprint } from '@/shared/audio/voiceprint';
import { INPUT_SAMPLE_RATE, MAX_BUFFERED_SECONDS } from '../config';

export interface AudioBatch {
  /** append and commit events, in the order they must be sent */
  events: Record<string, unknown>[];
  /** Samples in the append events: the audio actually sent, hence billed */
  samples: number;
  /** One per commit, in the same order: how each closed sentence sounded */
  voiceprints: (Voiceprint | null)[];
  /** One per commit, in the same order: epoch milliseconds when each sentence began */
  starts: number[];
}

export interface AudioOutbox {
  /** Queues a captured chunk; while reconnecting only the newest audio is kept */
  add: (pcm: Int16Array) => void;
  /** Runs the queue through the silence gate and returns what to send now */
  take: () => AudioBatch;
  /** True when something is queued */
  hasQueued: () => boolean;
  /** Stop or drop: forgets held silence and the open sentence; true if one was open */
  finish: () => boolean;
  /** True while no sentence is open (silence is being held back) */
  isIdle: () => boolean;
}

const MAX_BUFFERED_SAMPLES = INPUT_SAMPLE_RATE * MAX_BUFFERED_SECONDS;
export const COMMIT_EVENT = { type: 'input_audio_buffer.commit' } as const;

export function createAudioOutbox(): AudioOutbox {
  const gate = createSilenceGate(INPUT_SAMPLE_RATE);
  const meter = createVoiceprintMeter(INPUT_SAMPLE_RATE);
  let queue: Int16Array[] = [];
  /** Epoch milliseconds when each queued chunk began, as captured (same order as `queue`) */
  let queuedOn: number[] = [];
  let queuedSamples = 0;
  /** When the open sentence began, as the gate heard it; null while idle */
  let sentenceStart: number | null = null;

  function add(pcm: Int16Array): void {
    // The chunk has just been captured: it began its own length ago
    queuedOn.push(Date.now() - Math.round((pcm.length * 1000) / INPUT_SAMPLE_RATE));
    queue.push(pcm);
    queuedSamples += pcm.length;
    while (queuedSamples > MAX_BUFFERED_SAMPLES && queue.length > 1) {
      queuedSamples -= queue.shift()?.length ?? 0;
      queuedOn.shift();
    }
  }

  // Chunk by chunk, so a backlog replayed after a reconnect is gated (and closed) like live audio
  function take(): AudioBatch {
    const batch: AudioBatch = { events: [], samples: 0, voiceprints: [], starts: [] };
    let outgoing: Int16Array[] = [];
    const sendOutgoing = (): void => {
      if (!outgoing.length) return;
      const merged = mergePcm(outgoing);
      outgoing = [];
      batch.samples += merged.length;
      batch.events.push({ type: 'input_audio_buffer.append', audio: pcmToBase64(merged) });
    };
    queue.forEach((pcm, index) => {
      const wasIdle = gate.isIdle();
      const step = gate.push(pcm);
      // When the speech was captured, not when this batch goes out (up to a flush later)
      if (wasIdle && (step.commit || !gate.isIdle())) {
        sentenceStart = queuedOn[index] ?? Date.now();
      }
      outgoing.push(...step.audio);
      step.audio.forEach((sent) => meter.add(sent));
      // Audio first, then the commit: a commit can only refer to audio already sent
      if (step.commit) {
        sendOutgoing();
        batch.events.push(COMMIT_EVENT);
        batch.voiceprints.push(meter.take());
        batch.starts.push(sentenceStart ?? Date.now());
        sentenceStart = null;
      }
    });
    sendOutgoing();
    queue = [];
    queuedOn = [];
    queuedSamples = 0;
    return batch;
  }

  function hasQueued(): boolean {
    return queue.length > 0;
  }

  function finish(): boolean {
    meter.reset();
    sentenceStart = null;
    return gate.flush();
  }

  function isIdle(): boolean {
    return gate.isIdle();
  }

  return { add, take, hasQueued, finish, isIdle };
}
