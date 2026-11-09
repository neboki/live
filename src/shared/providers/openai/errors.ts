// Maps OpenAI failures (HTTP and Realtime) to the app's error classes, each
// with the i18n key the user sees. Technical details stay in `message`.

import {
  type AppError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  isAbortError,
} from '@/shared/errors';

interface OpenAiErrorBody {
  error?: { message?: unknown; code?: unknown; type?: unknown };
}

export interface OpenAiErrorDetail {
  message: string;
  code: string;
  type: string;
}

const QUOTA_CODE = 'insufficient_quota';
const INVALID_KEY_CODE = 'invalid_api_key';
const RATE_LIMIT_CODE = 'rate_limit_exceeded';
/** Azure: the model name sent doesn't match any deployment of the resource */
const DEPLOYMENT_CODE = 'DeploymentNotFound';
/** OpenAI: no model by that name (a typo in the settings, or no access to it) */
const MODEL_CODE = 'model_not_found';
/** The request itself was refused: a setting the model does not take, or a bad value */
const INVALID_REQUEST_TYPE = 'invalid_request_error';
/** Codes the demo proxy (functions/) answers with */
const DEMO_CODE_PREFIX = 'demo_';
const DEMO_ENDED_CODE = 'demo_expired';
/** This visitor, or everyone today, has used up the demos */
const DEMO_QUOTA_CODES = ['demo_client', 'demo_day'];
const STATUS_BAD_REQUEST = 400;
const STATUS_NOT_FOUND = 404;

/** A rejected key, model or setting won't fix itself: the session has to stop. */
export function isConfigurationError(error: AppError): boolean {
  return (
    error.status === 401 || error.status === STATUS_BAD_REQUEST || error.status === STATUS_NOT_FOUND
  );
}
/** Anything shaped like an OpenAI key, in case a server message echoes it */
const KEY_PATTERN = /sk-[A-Za-z0-9_-]{6,}/g;
const MAX_DETAIL_CHARS = 300;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Removes API keys from text that may end up in the console. */
export function redactKey(text: string, apiKey?: string): string {
  const withoutKey = apiKey ? text.split(apiKey).join('[redacted]') : text;
  return withoutKey.replace(KEY_PATTERN, '[redacted]');
}

/** Reads `{ error: { message, code, type } }` without trusting its shape. */
export function parseErrorBody(bodyText: string): OpenAiErrorDetail {
  try {
    const data = JSON.parse(bodyText) as OpenAiErrorBody | null;
    const error = data?.error;
    return {
      message: asText(error?.message) || bodyText,
      code: asText(error?.code),
      type: asText(error?.type),
    };
  } catch {
    return { message: bodyText, code: '', type: '' };
  }
}

/** Shared by HTTP and Realtime errors so both say the same thing to the user. */
export function errorFromCode(
  detail: OpenAiErrorDetail,
  status?: number,
  apiKey?: string,
): AppError | null {
  const message = redactKey(detail.message, apiKey).slice(0, MAX_DETAIL_CHARS);
  const isQuota = detail.code === QUOTA_CODE || detail.type === QUOTA_CODE;
  // The free demo's proxy: its time is up, or no more demos can start today
  if (detail.code === DEMO_ENDED_CODE) {
    return new UnauthorizedError(`Demo ended: ${message}`, 'errors.demoEnded');
  }
  if (DEMO_QUOTA_CODES.includes(detail.code)) {
    return new RateLimitError(`No demo left: ${message}`, 'errors.demoQuota');
  }
  if (detail.code.startsWith(DEMO_CODE_PREFIX)) {
    return new RateLimitError(`Demo unavailable: ${message}`, 'errors.demoUnavailable');
  }
  if (status === 401 || detail.code === INVALID_KEY_CODE) {
    return new UnauthorizedError(`OpenAI rejected the key: ${message}`, 'errors.invalidKey');
  }
  if (isQuota) {
    return new RateLimitError(`OpenAI quota exhausted: ${message}`, 'errors.noCredit');
  }
  if (status === 429 || detail.code === RATE_LIMIT_CODE) {
    return new RateLimitError(`OpenAI rate limit: ${message}`, 'errors.rateLimited');
  }
  if (detail.code === DEPLOYMENT_CODE) {
    return new NotFoundError(`Azure deployment not found: ${message}`, 'errors.deploymentNotFound');
  }
  if (status === STATUS_NOT_FOUND || detail.code === MODEL_CODE) {
    return new NotFoundError(`OpenAI model not found: ${message}`, 'errors.modelNotFound');
  }
  if (status === STATUS_BAD_REQUEST || detail.type === INVALID_REQUEST_TYPE) {
    return new ValidationError(`OpenAI rejected the request: ${message}`, 'errors.badSettings');
  }
  return null;
}

/**
 * Turns an OpenAI HTTP failure into an error with a user-facing message key. Given the
 * key, it is removed from the message whatever it looks like (Azure keys have no prefix).
 */
export function errorFromResponse(status: number, bodyText: string, apiKey?: string): AppError {
  const detail = parseErrorBody(bodyText);
  return (
    errorFromCode(detail, status, apiKey) ??
    new ExternalServiceError(
      `OpenAI responded ${status}: ${redactKey(detail.message, apiKey).slice(0, MAX_DETAIL_CHARS)}`,
      'errors.service',
    )
  );
}

/** A fetch that threw: offline, DNS, CORS or a blocked request. An abort is passed through. */
export function networkError(cause: unknown): AppError {
  if (isAbortError(cause)) throw cause;
  return new ExternalServiceError('Network error calling OpenAI', 'errors.connectionFailed', cause);
}
