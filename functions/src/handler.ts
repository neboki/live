// The demo endpoint, behind Firebase Hosting at /api/demo:
//   POST /api/demo/session                → a short-lived OpenAI key for live transcription
//   POST /api/demo/v1/chat/completions    → the translation, forwarded with the server's key
// The OpenAI key itself never leaves the server.

import { demoChatBody } from './chatBody.ts';
import type { Grants } from './grants.ts';

const OPENAI_API = 'https://api.openai.com/v1';
/** Cheapest transcription that works live; the session is pinned to it */
export const DEMO_TRANSCRIPTION_MODEL = 'gpt-transcribe';
/** The app's audio format */
const SAMPLE_RATE = 24_000;
/** Time the browser has to open the transcription socket with the key it is given */
const KEY_TTL_SECONDS = 60;

/** The few parts of Express's request and response the handler uses */
export interface DemoRequest {
  method: string;
  path: string;
  body: unknown;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface DemoResponse {
  status: (code: number) => DemoResponse;
  set: (field: string, value: string) => DemoResponse;
  json: (body: unknown) => void;
  write: (chunk: Uint8Array) => boolean;
  end: () => void;
  /** True once the status and headers are on their way */
  headersSent?: boolean;
}

export interface DemoDeps {
  grants: Grants;
  /** The server's OpenAI key (a Firebase secret) */
  openAiKey: () => string;
  /** How long a demo lasts, in seconds; the app stops itself then */
  demoSeconds: number;
  fetch?: typeof fetch;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

function fail(res: DemoResponse, status: number, code: string, message: string): void {
  // OpenAI's error shape, so the app reads it like any other OpenAI error
  res.status(status).json({ error: { code, message, type: 'demo' } });
}

function header(req: DemoRequest, name: string): string {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** The visitor's address: Hosting puts it first in X-Forwarded-For */
export function clientOf(req: DemoRequest): string {
  const forwarded = header(req, 'x-forwarded-for').split(',')[0]?.trim();
  return forwarded || req.ip || 'unknown';
}

function bearer(req: DemoRequest): string {
  const match = /^Bearer\s+(\S+)$/i.exec(header(req, 'authorization'));
  return match?.[1] ?? '';
}

export function createDemoHandler(
  deps: DemoDeps,
): (req: DemoRequest, res: DemoResponse) => Promise<void> {
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

  async function session(req: DemoRequest, res: DemoResponse): Promise<void> {
    const refused = deps.grants.admit(clientOf(req), now());
    if (refused) {
      fail(res, 429, `demo_${refused}`, 'No more demos for now');
      return;
    }
    const response = await openAi('/realtime/client_secrets', {
      expires_after: { anchor: 'created_at', seconds: KEY_TTL_SECONDS },
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: SAMPLE_RATE },
            transcription: { model: DEMO_TRANSCRIPTION_MODEL },
            turn_detection: null,
          },
        },
      },
    });
    if (!response.ok) {
      log('OpenAI refused a demo key', { status: response.status, body: await response.text() });
      fail(res, 502, 'demo_unavailable', 'The demo is not available right now');
      return;
    }
    const secret = (await response.json()) as { value?: unknown };
    if (typeof secret.value !== 'string' || !secret.value) {
      log('OpenAI sent a demo key without a value', secret);
      fail(res, 502, 'demo_unavailable', 'The demo is not available right now');
      return;
    }
    deps.grants.issue(secret.value, now());
    res.status(200).json({ key: secret.value, seconds: deps.demoSeconds });
  }

  async function chat(req: DemoRequest, res: DemoResponse): Promise<void> {
    if (!deps.grants.spend(bearer(req), now())) {
      fail(res, 401, 'demo_expired', 'This demo has ended');
      return;
    }
    const body = demoChatBody(req.body);
    if (!body) {
      fail(res, 400, 'demo_request', 'Not a request the demo makes');
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

  return async (req, res) => {
    try {
      if (req.method !== 'POST') {
        fail(res, 405, 'demo_method', 'Use POST');
      } else if (req.path.endsWith('/session')) {
        await session(req, res);
      } else if (req.path.endsWith('/v1/chat/completions')) {
        await chat(req, res);
      } else {
        fail(res, 404, 'demo_not_found', 'Not found');
      }
    } catch (err) {
      log('Demo request failed', err);
      // A stream cut halfway can only be ended; the app sees the translation stop
      if (res.headersSent) res.end();
      else fail(res, 502, 'demo_unavailable', 'The demo is not available right now');
    }
  };
}
