// The free minutes: an account signed in with Google gets a few minutes a month on
// Neboki's key (functions/). The server hands out a short-lived transcription key, the
// app checks in while the session runs, and the translations go through the server.

import { type AppError, ExternalServiceError, UnauthorizedError } from '@/shared/errors';
import { FREE_API } from './config';
import { errorFromResponse, networkError } from './errors';

/** What the server gives a session: a short-lived key, the seconds left and how often to check in */
export interface FreeGrant {
  key: string;
  seconds: number;
  tickSeconds: number;
}

/** The minutes left this month */
export interface FreeBalance {
  seconds: number;
  monthSeconds: number;
  /** False when the free minutes are paused for everyone until next month */
  available: boolean;
}

/** Whether this build has the free minutes server (the Firebase one does, local builds do not) */
export const hasFreeServer = FREE_API !== '';

type IdTokenSource = () => Promise<string | null>;
let idTokenSource: IdTokenSource | null = null;

/** The account module tells how to get the signed-in user's Google ID token */
export function setIdTokenSource(source: IdTokenSource | null): void {
  idTokenSource = source;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const isSeconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function isGrant(value: unknown): value is FreeGrant {
  if (!isRecord(value)) return false;
  const { key, seconds, tickSeconds } = value;
  return (
    typeof key === 'string' &&
    key !== '' &&
    isSeconds(seconds) &&
    isSeconds(tickSeconds) &&
    tickSeconds > 0
  );
}

function isBalance(value: unknown): value is FreeBalance {
  if (!isRecord(value)) return false;
  return (
    isSeconds(value.seconds) &&
    isSeconds(value.monthSeconds) &&
    typeof value.available === 'boolean'
  );
}

const unavailable = (why: string): AppError =>
  new ExternalServiceError(why, 'errors.freeUnavailable');

/** POSTs to the free server and reads an answer `accept` approves, or the error to show */
async function post<T>(
  path: string,
  bearer: string,
  accept: (value: unknown) => value is T,
): Promise<T | AppError> {
  let response: Response;
  try {
    response = await fetch(`${FREE_API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}` },
    });
  } catch (err) {
    return networkError(err);
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) return errorFromResponse(response.status, text);
  try {
    const value: unknown = JSON.parse(text);
    if (accept(value)) return value;
  } catch {
    // Reported below like any other unreadable answer
  }
  return unavailable(`The free minutes server sent an unexpected answer to ${path}`);
}

async function idToken(): Promise<string | AppError> {
  try {
    const token = idTokenSource ? await idTokenSource() : null;
    return token ?? new UnauthorizedError('Not signed in', 'errors.freeSignin');
  } catch (err) {
    return new ExternalServiceError(
      'Could not get the sign-in token',
      'errors.connectionFailed',
      err,
    );
  }
}

/** The minutes the signed-in account has left this month */
export async function fetchFreeBalance(): Promise<FreeBalance | AppError> {
  const token = await idToken();
  return typeof token === 'string' ? post('/balance', token, isBalance) : token;
}

/** Starts a free session for the signed-in account */
export async function requestFreeSession(): Promise<FreeGrant | AppError> {
  const token = await idToken();
  return typeof token === 'string' ? post('/session', token, isGrant) : token;
}

/** The check-in that keeps a free session going; resolves with the seconds left */
export function sendFreeTick(key: string): Promise<{ seconds: number } | AppError> {
  return post('/tick', key, (value): value is { seconds: number } =>
    isRecord(value) ? isSeconds(value.seconds) : false,
  );
}
