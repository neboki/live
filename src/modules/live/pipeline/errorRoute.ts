import type { AppError } from '@/shared/errors';
import { isConfigurationError } from '@/shared/providers/openai/errors';

/** fatal stops the session, notice is shown for a while, log only goes to the console */
export type ErrorRoute = 'fatal' | 'notice' | 'log';

/** connectionLost: the transcriber already gave up reconnecting */
const FATAL_KEYS: ReadonlySet<string> = new Set(['errors.noCredit', 'errors.connectionLost']);
const NOTICE_KEYS: ReadonlySet<string> = new Set(['errors.connectionFailed']);
const STATUS_RATE_LIMITED = 429;
const STATUS_SERVER = 500;

/**
 * A rejected key, model or setting, no credit or a lost transcriber won't fix itself;
 * the rest is transient.
 */
export function routeError(error: AppError): ErrorRoute {
  if (isConfigurationError(error) || FATAL_KEYS.has(error.userMessageKey)) return 'fatal';
  if (
    error.status === STATUS_RATE_LIMITED ||
    error.status >= STATUS_SERVER ||
    NOTICE_KEYS.has(error.userMessageKey)
  ) {
    return 'notice';
  }
  return 'log';
}
