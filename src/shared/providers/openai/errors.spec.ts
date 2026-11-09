import { describe, expect, it } from 'vitest';
import { RateLimitError, UnauthorizedError } from '@/shared/errors';
import { errorFromResponse, networkError, parseErrorBody, redactKey } from './errors';
import { fakeOpenAiKey } from '@/shared/testing/keys.fakes';

function body(code: string, type = ''): string {
  return JSON.stringify({ error: { message: 'detail', code, type } });
}

describe('errorFromResponse', () => {
  it('maps 401 to invalidKey', () => {
    const error = errorFromResponse(401, body('invalid_api_key'));

    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.userMessageKey).toBe('errors.invalidKey');
  });

  it('maps a 429 with insufficient_quota (code or type) to noCredit', () => {
    expect(errorFromResponse(429, body('insufficient_quota')).userMessageKey).toBe(
      'errors.noCredit',
    );
    expect(errorFromResponse(429, body('', 'insufficient_quota')).userMessageKey).toBe(
      'errors.noCredit',
    );
  });

  it('maps any other 429 to rateLimited', () => {
    const error = errorFromResponse(429, body('rate_limit_exceeded'));

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.status).toBe(429);
    expect(error.userMessageKey).toBe('errors.rateLimited');
    expect(errorFromResponse(429, 'not json').userMessageKey).toBe('errors.rateLimited');
  });

  it('maps 5xx and other statuses to service', () => {
    expect(errorFromResponse(500, 'oops')).toMatchObject({
      status: 502,
      userMessageKey: 'errors.service',
    });
    expect(errorFromResponse(503, body('overloaded')).userMessageKey).toBe('errors.service');
  });

  it('maps a missing model (404 or model_not_found) to modelNotFound', () => {
    expect(errorFromResponse(404, body('model_not_found')).userMessageKey).toBe(
      'errors.modelNotFound',
    );
    expect(errorFromResponse(404, 'not json').userMessageKey).toBe('errors.modelNotFound');
    expect(errorFromResponse(404, body('DeploymentNotFound')).userMessageKey).toBe(
      'errors.deploymentNotFound',
    );
  });

  it('maps a refused request (400 or invalid_request_error) to badSettings', () => {
    expect(errorFromResponse(400, body('bad_request')).userMessageKey).toBe('errors.badSettings');
    expect(errorFromResponse(400, body('bad_request')).status).toBe(400);
    expect(errorFromResponse(422, body('x', 'invalid_request_error')).userMessageKey).toBe(
      'errors.badSettings',
    );
  });

  it('never keeps a key echoed in the body', () => {
    const echoed = JSON.stringify({ error: { message: `Bad key ${fakeOpenAiKey('FAKE123456')}` } });

    expect(errorFromResponse(401, echoed).message).not.toContain(fakeOpenAiKey('FAKE123456'));
  });

  it('removes the given key even when it looks like nothing in particular', () => {
    const azureKey = '0123456789abcdef0123456789abcdef';
    const echoed = JSON.stringify({ error: { message: `Access denied for ${azureKey}` } });

    expect(errorFromResponse(401, echoed, azureKey).message).not.toContain(azureKey);
    expect(errorFromResponse(500, echoed, azureKey).message).not.toContain(azureKey);
  });
});

describe('networkError', () => {
  it('maps a failed fetch to connectionFailed and keeps the cause', () => {
    const cause = new TypeError('Failed to fetch');
    const error = networkError(cause);

    expect(error.userMessageKey).toBe('errors.connectionFailed');
    expect(error.cause).toBe(cause);
  });

  it('rethrows an abort untouched', () => {
    const abort = new DOMException('Aborted', 'AbortError');

    expect(() => networkError(abort)).toThrow(abort);
  });
});

describe('helpers', () => {
  it('parses odd bodies without throwing', () => {
    expect(parseErrorBody('null')).toEqual({ message: 'null', code: '', type: '' });
    expect(parseErrorBody('{"error":{"code":5}}').code).toBe('');
  });

  it('redacts the given key and anything shaped like one', () => {
    expect(redactKey(`a my-key b ${fakeOpenAiKey('proj-123456789')}`, 'my-key')).toBe(
      'a [redacted] b [redacted]',
    );
  });
});
