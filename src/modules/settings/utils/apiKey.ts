// Format check only: whether OpenAI or Azure accepts the key is verified when the session starts.

/** Printable ASCII only: anything else can't travel in the Authorization header */
const OPENAI_KEY_PATTERN = /^sk-[\x21-\x7E]{20,}$/;
/** Azure keys: 32 hex characters (older resources) or 84 letters and digits */
const AZURE_KEY_PATTERN = /^[A-Za-z0-9]{32,128}$/;
/** Whitespace, line breaks and zero-width characters picked up when copying the key */
const INVISIBLE_PATTERN = /[\s\u200B-\u200D\u2060\uFEFF]+/g;
const WRAPPING_QUOTES_PATTERN = /^["'`]+|["'`]+$/g;
const BEARER_PREFIX_PATTERN = /^bearer/i;

export function isLikelyOpenAiKey(value: string): boolean {
  return OPENAI_KEY_PATTERN.test(value.trim());
}

export function isLikelyAzureKey(value: string): boolean {
  return AZURE_KEY_PATTERN.test(value.trim());
}

/** Cleans what a paste drags along: breaks, quotes, a "Bearer " prefix. */
export function normalizeApiKey(value: string): string {
  return value
    .replace(INVISIBLE_PATTERN, '')
    .replace(BEARER_PREFIX_PATTERN, '')
    .replace(WRAPPING_QUOTES_PATTERN, '');
}
