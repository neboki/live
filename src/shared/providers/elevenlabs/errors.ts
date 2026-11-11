// Maps ElevenLabs failures to the app's error classes, each with the i18n key the user
// sees. Technical details stay in `message`, with the key removed.

import {
  type AppError,
  ExternalServiceError,
  RateLimitError,
  UnauthorizedError,
  isAbortError,
} from '@/shared/errors';

/** ElevenLabs answers `{ detail: { status, message } }`, or `{ detail: [...] }` on a 422 */
interface ElevenLabsErrorBody {
  detail?: { status?: unknown; message?: unknown } | unknown[];
}

/** Anything shaped like an ElevenLabs key, in case a server message echoes it */
const KEY_PATTERN = /sk_[A-Za-z0-9]{6,}/g;
const MAX_DETAIL_CHARS = 300;
/** Statuses ElevenLabs sends when the account has no credit left */
const NO_CREDIT_STATUSES = ['quota_exceeded', 'payment_required', 'insufficient_credits'];
const STATUS_UNAUTHORIZED = 401;
const STATUS_PAYMENT = 402;
const STATUS_TOO_MANY = 429;

/** Removes ElevenLabs keys from text that may end up in the console. */
export function redactElevenLabsKey(text: string, apiKey?: string): string {
  const withoutKey = apiKey ? text.split(apiKey).join('[redacted]') : text;
  return withoutKey.replace(KEY_PATTERN, '[redacted]');
}

function readDetail(bodyText: string): { status: string; message: string } {
  try {
    const data = JSON.parse(bodyText) as ElevenLabsErrorBody | null;
    const detail = data?.detail;
    if (detail && !Array.isArray(detail) && typeof detail === 'object') {
      return {
        status: typeof detail.status === 'string' ? detail.status : '',
        message: typeof detail.message === 'string' ? detail.message : bodyText,
      };
    }
  } catch {
    // Not JSON: the raw text is the message
  }
  return { status: '', message: bodyText };
}

/** Turns an ElevenLabs HTTP failure into an error with a user-facing message key. */
export function elevenLabsError(httpStatus: number, bodyText: string, apiKey?: string): AppError {
  const { status, message } = readDetail(bodyText);
  const clean = redactElevenLabsKey(message, apiKey).slice(0, MAX_DETAIL_CHARS);
  if (NO_CREDIT_STATUSES.includes(status) || httpStatus === STATUS_PAYMENT) {
    return new RateLimitError(`ElevenLabs has no credit left: ${clean}`, 'errors.ttsCredit');
  }
  if (httpStatus === STATUS_UNAUTHORIZED) {
    return new UnauthorizedError(`ElevenLabs rejected the key: ${clean}`, 'errors.ttsKey');
  }
  if (httpStatus === STATUS_TOO_MANY) {
    return new RateLimitError(`ElevenLabs rate limit: ${clean}`, 'errors.ttsFailed');
  }
  return new ExternalServiceError(
    `ElevenLabs responded ${httpStatus}: ${clean}`,
    'errors.ttsFailed',
  );
}

/** A fetch that threw: offline, DNS or a blocked request. An abort is passed through. */
export function elevenLabsNetworkError(cause: unknown): AppError {
  if (isAbortError(cause)) throw cause;
  return new ExternalServiceError('Network error calling ElevenLabs', 'errors.ttsFailed', cause);
}
