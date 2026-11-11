// Endpoints and models of ElevenLabs, the optional voice. See docs/adr/0010-elevenlabs-voice.md.

export const ELEVENLABS_API = 'https://api.elevenlabs.io';

/**
 * Flash v2.5: about 100 ms to the first sound, 32 languages, the cheapest tier
 * ($0.04 per 1K characters). It takes `language_code` and `previous_text` on the
 * plain streaming endpoint, which the app's PCM player already plays.
 */
export const DEFAULT_VOICE_MODEL = 'eleven_flash_v2_5';
/**
 * "George", a premade multilingual voice every account has (the one in ElevenLabs'
 * own examples). The voice list from the account replaces it once the key is set.
 */
export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

/** Raw PCM16 mono at 24 kHz: the same as the PCM player plays, on every plan */
export const OUTPUT_FORMAT = 'pcm_24000';

/** Where to create a key, restricted to text to speech and with a credit limit */
export const KEY_PAGE = 'https://elevenlabs.io/app/settings/api-keys';

/** Voices asked for at once; the API takes at most 100 */
export const VOICE_PAGE_SIZE = 100;
