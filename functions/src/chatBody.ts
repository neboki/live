// What the free plan's proxy forwards to OpenAI's chat completions: only the shape the app
// sends, always on the cheap model, with the length of the request and of the answer capped.

export const FREE_TEXT_MODEL = 'gpt-6-luna';
/** Longest answer the app asks for (the summary) */
export const MAX_OUTPUT_TOKENS = 600;
/** Longest system or user message: the app's prompts plus a few earlier lines */
export const MAX_MESSAGE_CHARS = 12_000;

interface Message {
  role: 'system' | 'user';
  content: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMessage(value: unknown): Message | null {
  if (!isRecord(value)) return null;
  const { role, content } = value;
  if (role !== 'system' && role !== 'user') return null;
  if (typeof content !== 'string' || content.length > MAX_MESSAGE_CHARS) return null;
  return { role, content };
}

/**
 * The body to send to OpenAI for what the browser asked, or null when it is not a request
 * the app makes (then nothing is sent). Model, effort and limits are the proxy's, never
 * the caller's.
 */
export function freeChatBody(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input) || !Array.isArray(input.messages) || input.messages.length !== 2) {
    return null;
  }
  const messages = input.messages.map(toMessage);
  if (messages.some((message) => message === null)) return null;
  const requested = input.max_completion_tokens;
  const maxTokens =
    typeof requested === 'number' && Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_OUTPUT_TOKENS)
      : MAX_OUTPUT_TOKENS;
  const stream = input.stream === true;
  const json = isRecord(input.response_format) && input.response_format.type === 'json_object';
  return {
    model: FREE_TEXT_MODEL,
    reasoning_effort: 'none',
    max_completion_tokens: maxTokens,
    messages,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}
