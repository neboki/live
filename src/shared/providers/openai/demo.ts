import { type AppError, ExternalServiceError } from '@/shared/errors';
import { DEMO_API } from './config';
import { errorFromResponse, networkError } from './errors';

/** What the demo server gives a visitor: a short-lived key and how long the demo lasts */
export interface DemoGrant {
  key: string;
  seconds: number;
}

/** Whether this build has the free demo (the Firebase one does, local builds do not) */
export const hasDemo = DEMO_API !== '';

function isGrant(value: unknown): value is DemoGrant {
  if (typeof value !== 'object' || value === null) return false;
  const { key, seconds } = value as Record<string, unknown>;
  return typeof key === 'string' && key !== '' && typeof seconds === 'number' && seconds > 0;
}

/** Asks the demo server for a demo; resolves with the grant, or the error to show. */
export async function requestDemo(): Promise<DemoGrant | AppError> {
  let response: Response;
  try {
    response = await fetch(`${DEMO_API}/session`, { method: 'POST' });
  } catch (err) {
    return networkError(err);
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) return errorFromResponse(response.status, text);
  try {
    const grant: unknown = JSON.parse(text);
    if (isGrant(grant)) return grant;
  } catch {
    // Reported below like any other unreadable answer
  }
  return new ExternalServiceError('The demo server sent no key', 'errors.demoUnavailable');
}
