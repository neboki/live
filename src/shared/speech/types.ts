/** Something that can read text aloud. `speak` resolves when playback ends. */
export interface TtsProvider {
  speak(text: string, lang: string, signal?: AbortSignal): Promise<void>;
  stop(): void;
  /** Releases what the engine holds (an audio output); nothing can be spoken afterwards */
  close?(): void;
}

/** The browser's own voice (free) or ElevenLabs' (billed to the user's ElevenLabs key) */
export type TtsEngine = 'browser' | 'elevenlabs';

/** Voice settings as the settings store keeps them. */
export interface TtsSettings {
  engine: TtsEngine;
  /** ElevenLabs model id */
  model: string;
  /** ElevenLabs voice id */
  voice: string;
}
