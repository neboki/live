import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AppError,
  BusinessError,
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  UnsupportedFeatureError,
  ValidationError,
  isAbortError,
  logError,
  toAppError,
} from './index';

describe('error classes', () => {
  it.each([
    [new ValidationError('x'), 400, 'errors.validation'],
    [new UnauthorizedError('x'), 401, 'errors.invalidKey'],
    [new ForbiddenError('x'), 403, 'errors.unexpected'],
    [new NotFoundError('x'), 404, 'errors.unexpected'],
    [new ConflictError('x'), 409, 'errors.unexpected'],
    [new BusinessError('x'), 422, 'errors.unexpected'],
    [new UnsupportedFeatureError('pip'), 422, 'errors.unsupported'],
    [new RateLimitError('x'), 429, 'errors.rateLimited'],
    [new ExternalServiceError('x'), 502, 'errors.service'],
  ])('%s has its status and default key', (error, status, key) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(status);
    expect(error.userMessageKey).toBe(key);
    expect(error.name).toBe(error.constructor.name);
  });

  it('accepts a custom key and keeps the cause', () => {
    const cause = new Error('boom');
    const error = new RateLimitError('quota', 'errors.noCredit', cause);

    expect(error.userMessageKey).toBe('errors.noCredit');
    expect(error.cause).toBe(cause);
  });

  it('treats an unsupported feature as a business error', () => {
    const error = new UnsupportedFeatureError('getDisplayMedia', 'errors.captureUnsupported');

    expect(error).toBeInstanceOf(BusinessError);
    expect(error.message).toContain('getDisplayMedia');
  });

  it('defaults the base class to 500 and errors.unexpected', () => {
    const error = new AppError('x');

    expect(error.status).toBe(500);
    expect(error.userMessageKey).toBe('errors.unexpected');
  });
});

describe('toAppError', () => {
  it('keeps AppErrors and wraps anything else', () => {
    const known = new ValidationError('x');
    const wrapped = toAppError(new TypeError('bad'));

    expect(toAppError(known)).toBe(known);
    expect(wrapped.message).toBe('bad');
    expect(wrapped.cause).toBeInstanceOf(TypeError);
    expect(toAppError('text').message).toBe('text');
  });
});

describe('logError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs with context and returns the wrapped error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = logError('Doing things', new Error('boom'));

    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('boom');
    expect(spy).toHaveBeenCalledWith('[Neboki Live] Doing things', result);
  });
});

describe('isAbortError', () => {
  it('recognises aborted fetches and nothing else', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
    expect(isAbortError(new ExternalServiceError('x'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});
