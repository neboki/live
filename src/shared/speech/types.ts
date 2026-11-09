/** Something that can read text aloud. `speak` resolves when playback ends. */
export interface TtsProvider {
  speak(text: string, lang: string, signal?: AbortSignal): Promise<void>;
  stop(): void;
  /** Releases what the engine holds (an audio output); nothing can be spoken afterwards */
  close?(): void;
}

export type TtsEngine = 'browser' | 'openai';

/** Voice settings as the settings store keeps them. */
export interface TtsSettings {
  engine: TtsEngine;
  model: string;
  voice: string;
}
