// Base error hierarchy. `userMessageKey` is an i18n key shown to the user;
// `message` and `cause` are technical details for the console.

export interface AppErrorOptions {
  /** HTTP-like status used to classify the error (500 when omitted) */
  status?: number;
  /** i18n key of the message shown to the user */
  userMessageKey?: string;
  /** Original error, kept for debugging */
  cause?: unknown;
}

const LOG_PREFIX = '[Neboki Live]';

export class AppError extends Error {
  readonly status: number;
  readonly userMessageKey: string;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status ?? 500;
    this.userMessageKey = options.userMessageKey ?? 'errors.unexpected';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, userMessageKey = 'errors.validation', cause?: unknown) {
    super(message, { status: 400, userMessageKey, cause });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, userMessageKey = 'errors.invalidKey', cause?: unknown) {
    super(message, { status: 401, userMessageKey, cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, userMessageKey = 'errors.unexpected', cause?: unknown) {
    super(message, { status: 403, userMessageKey, cause });
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, userMessageKey = 'errors.unexpected', cause?: unknown) {
    super(message, { status: 404, userMessageKey, cause });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, userMessageKey = 'errors.unexpected', cause?: unknown) {
    super(message, { status: 409, userMessageKey, cause });
  }
}

export class BusinessError extends AppError {
  constructor(message: string, userMessageKey = 'errors.unexpected', cause?: unknown) {
    super(message, { status: 422, userMessageKey, cause });
  }
}

/** A browser API the app needs is missing (e.g. getDisplayMedia, Document PiP). */
export class UnsupportedFeatureError extends BusinessError {
  constructor(feature: string, userMessageKey = 'errors.unsupported', cause?: unknown) {
    super(`Unsupported browser feature: ${feature}`, userMessageKey, cause);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, userMessageKey = 'errors.rateLimited', cause?: unknown) {
    super(message, { status: 429, userMessageKey, cause });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, userMessageKey = 'errors.service', cause?: unknown) {
    super(message, { status: 502, userMessageKey, cause });
  }
}

/** Wraps anything thrown into an AppError, keeping AppErrors as they are. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(message, { cause: err });
}

/** Logs with context and returns the error as an AppError for the caller to surface. */
export function logError(context: string, err: unknown): AppError {
  const appError = toAppError(err);
  console.error(`${LOG_PREFIX} ${context}`, appError);
  return appError;
}

/** True for a cancelled fetch/stream (AbortController), which is never an error to report. */
export function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { name?: unknown }).name === 'AbortError';
}
