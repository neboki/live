/** Something that can read text aloud. `speak` resolves when playback ends. */
export interface TtsProvider {
  speak(text: string, lang: string, signal?: AbortSignal): Promise<void>;
  /** Resolves once the audio is over, for engines whose speak() returns a little early */
  settle?(): Promise<void>;
  stop(): void;
  /** Releases what the engine holds (an audio output); nothing can be spoken afterwards */
  close?(): void;
}

/**
 * OpenAI's voice (the default, billed to the OpenAI key) or ElevenLabs' (optional, billed to
 * the user's ElevenLabs key). The browser's own voice is not a choice: it only reads when
 * the chosen one fails or has no key.
 */
export type TtsEngine = 'openai' | 'elevenlabs';

/** Voice settings as the settings store keeps them. */
export interface TtsSettings {
  engine: TtsEngine;
  /** OpenAI voice model (on Azure, the deployment name) */
  model: string;
  /** OpenAI voice name */
  voice: string;
  /** ElevenLabs model id */
  elevenLabsModel: string;
  /** ElevenLabs voice id */
  elevenLabsVoice: string;
}
