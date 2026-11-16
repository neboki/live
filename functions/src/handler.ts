// The free plan, behind Firebase Hosting at /api/free. Every account signed in with Google
// gets FREE_MONTH_SECONDS a month, at Medium quality:
//   POST /api/free/balance               → the minutes left this month (Google ID token)
//   POST /api/free/session               → a short-lived OpenAI key for live transcription
//   POST /api/free/tick                  → a check-in every TICK_SECONDS; pays for that time
//   POST /api/free/v1/chat/completions   → the translation, forwarded with the server's key
// The OpenAI key itself never leaves the server, and the audio never reaches it: the
// browser streams it straight to OpenAI with the short-lived key.
import { freeChatBody } from './chatBody.ts';
import type { Grants } from './grants.ts';
import {
  FREE_MONTH_SECONDS,
  FREE_TRANSCRIPTION_MODEL,
  GLOBAL_MONTH_SECONDS,
  TICK_SECONDS,
  monthOf,
} from './plan.ts';
import type { MonthUsage, UsageStore } from './usage.ts';

const OPENAI_API = 'https://api.openai.com/v1';
/** The app's audio format */
const SAMPLE_RATE = 24_000;
/** Time the browser has to open the transcription socket with the key it is given */
const KEY_TTL_SECONDS = 60;

/** The few parts of Express's request and response the handler uses */
export interface FreeRequest {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export interface FreeResponse {
  status: (code: number) => FreeResponse;
  set: (field: string, value: string) => FreeResponse;
  json: (body: unknown) => void;
  write: (chunk: Uint8Array) => boolean;
  end: () => void;
  /** True once the status and headers are on their way */
  headersSent?: boolean;
}

export interface FreeDeps {
  grants: Grants;
  usage: UsageStore;
  /** The account a Google (Firebase) ID token belongs to, or null when it is not valid */
  verifyUser: (idToken: string) => Promise<string | null>;
  /** The server's OpenAI key (a Firebase secret) */
  openAiKey: () => string;
  fetch?: typeof fetch;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

/** Why a free session may not start or go on */
type Refusal = 'free_month' | 'free_budget';

function fail(res: FreeResponse, status: number, code: string, message: string): void {
  // OpenAI's error shape, so the app reads it like any other OpenAI error
  res.status(status).json({ error: { code, message, type: 'free' } });
}

function header(req: FreeRequest, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function bearer(req: FreeRequest): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header(req, 'authorization'));
  return match?.[1] ?? '';
}

/** Seconds this account still has this month */
function left(used: MonthUsage): number {
  return Math.max(0, FREE_MONTH_SECONDS - used.user);
}

function refusalOf(used: MonthUsage): Refusal | null {
  if (left(used) <= 0) return 'free_month';
  if (used.total >= GLOBAL_MONTH_SECONDS) return 'free_budget';
  return null;
}

function refuse(res: FreeResponse, refusal: Refusal): void {
  if (refusal === 'free_month') fail(res, 429, refusal, 'No free minutes left this month');
  else fail(res, 429, refusal, 'Free minutes are paused until next month');
}

export function createFreeHandler(
  deps: FreeDeps,
): (req: FreeRequest, res: FreeResponse) => Promise<void> {
  const send = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(message, detail));

  function openAi(path: string, body: unknown): Promise<Response> {
    return send(`${OPENAI_API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.openAiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /** The signed-in account, or null once a 401 is sent */
  async function signedIn(req: FreeRequest, res: FreeResponse): Promise<string | null> {
    const token = bearer(req);
    const uid = token ? await deps.verifyUser(token) : null;
    if (!uid) fail(res, 401, 'free_signin', 'Sign in with Google to use the free minutes');
    return uid;
  }

  async function balance(req: FreeRequest, res: FreeResponse): Promise<void> {
    const uid = await signedIn(req, res);
    if (!uid) return;
    const used = await deps.usage.read(uid, monthOf(now()));
    res.status(200).json({
      seconds: left(used),
      monthSeconds: FREE_MONTH_SECONDS,
      available: used.total < GLOBAL_MONTH_SECONDS,
    });
  }

  async function session(req: FreeRequest, res: FreeResponse): Promise<void> {
    const uid = await signedIn(req, res);
    if (!uid) return;
    const month = monthOf(now());
    const refused = refusalOf(await deps.usage.read(uid, month));
    if (refused) {
      refuse(res, refused);
      return;
    }
    const response = await openAi('/realtime/client_secrets', {
      expires_after: { anchor: 'created_at', seconds: KEY_TTL_SECONDS },
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: SAMPLE_RATE },
            transcription: { model: FREE_TRANSCRIPTION_MODEL },
            turn_detection: null,
          },
        },
      },
    });
    if (!response.ok) {
      log('OpenAI refused a free key', { status: response.status, body: await response.text() });
      fail(res, 502, 'free_unavailable', 'The free minutes are not available right now');
      return;
    }
    const secret = (await response.json()) as { value?: unknown };
    if (typeof secret.value !== 'string' || !secret.value) {
      log('OpenAI sent a free key without a value', secret);
      fail(res, 502, 'free_unavailable', 'The free minutes are not available right now');
      return;
    }
    // The first stretch is paid up front, so starting over and over is never free
    const used = await deps.usage.charge(uid, month, TICK_SECONDS);
    deps.grants.issue(secret.value, uid, now());
    res.status(200).json({ key: secret.value, seconds: left(used), tickSeconds: TICK_SECONDS });
  }

  async function tick(req: FreeRequest, res: FreeResponse): Promise<void> {
    const key = bearer(req);
    const uid = key ? deps.grants.renew(key, now()) : null;
    if (!uid) {
      fail(res, 401, 'free_expired', 'This free session has ended');
      return;
    }
    const month = monthOf(now());
    const before = await deps.usage.read(uid, month);
    const refused = refusalOf(before);
    if (refused) {
      deps.grants.revoke(key);
      refuse(res, refused);
      return;
    }
    const used = await deps.usage.charge(uid, month, TICK_SECONDS);
    res.status(200).json({ seconds: left(used) });
  }

  async function chat(req: FreeRequest, res: FreeResponse): Promise<void> {
    if (!deps.grants.spend(bearer(req), now())) {
      fail(res, 401, 'free_expired', 'This free session has ended');
      return;
    }
    const body = freeChatBody(req.body);
    if (!body) {
      fail(res, 400, 'free_request', 'Not a request the app makes');
      return;
    }
    const response = await openAi('/chat/completions', body);
    res.status(response.status);
    res.set('Content-Type', response.headers.get('content-type') ?? 'application/json');
    res.set('Cache-Control', 'no-store');
    if (!response.body) {
      res.end();
      return;
    }
    // Streamed through as it arrives: the captions show the translation word by word
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  }

  const routes: Record<string, (req: FreeRequest, res: FreeResponse) => Promise<void>> = {
    '/balance': balance,
    '/session': session,
    '/tick': tick,
    '/v1/chat/completions': chat,
  };

  return async (req, res) => {
    try {
      const route = Object.keys(routes).find((path) => req.path.endsWith(path));
      if (req.method !== 'POST') fail(res, 405, 'free_method', 'Use POST');
      else if (!route) fail(res, 404, 'free_not_found', 'Not found');
      else await routes[route]?.(req, res);
    } catch (err) {
      log('Free request failed', err);
      // A stream cut halfway can only be ended; the app sees the translation stop
      if (res.headersSent) res.end();
      else fail(res, 502, 'free_unavailable', 'The free minutes are not available right now');
    }
  };
}
