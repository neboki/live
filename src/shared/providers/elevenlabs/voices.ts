import { ELEVENLABS_API, VOICE_PAGE_SIZE } from './config';
import { elevenLabsError, elevenLabsNetworkError } from './errors';

/** A voice the account can use: ElevenLabs' own, or one the user made or saved */
export interface ElevenLabsVoice {
  id: string;
  name: string;
  /** "premade", "cloned", "generated", "professional"… */
  category: string;
}

interface VoicesBody {
  voices?: unknown;
}

function toVoice(value: unknown): ElevenLabsVoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.voice_id !== 'string' || !entry.voice_id) return null;
  return {
    id: entry.voice_id,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : entry.voice_id,
    category: typeof entry.category === 'string' ? entry.category : '',
  };
}

/**
 * The voices of the account behind `apiKey` (GET /v2/voices, first page): the user's own
 * first, then ElevenLabs' premade ones, each group by name.
 */
export async function listElevenLabsVoices(
  apiKey: string,
  signal?: AbortSignal,
): Promise<ElevenLabsVoice[]> {
  const url = `${ELEVENLABS_API}/v2/voices?page_size=${VOICE_PAGE_SIZE}&include_total_count=false`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'xi-api-key': apiKey }, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw elevenLabsNetworkError(err);
  }
  const text = await response.text();
  if (!response.ok) throw elevenLabsError(response.status, text, apiKey);
  let body: VoicesBody | null;
  try {
    body = JSON.parse(text) as VoicesBody | null;
  } catch {
    body = null;
  }
  const voices = Array.isArray(body?.voices) ? body.voices : [];
  return voices
    .map(toVoice)
    .filter((voice): voice is ElevenLabsVoice => voice !== null)
    .sort(
      (a, b) =>
        Number(a.category === 'premade') - Number(b.category === 'premade') ||
        a.name.localeCompare(b.name),
    );
}
