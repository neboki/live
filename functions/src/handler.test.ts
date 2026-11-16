import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { freeChatBody, FREE_TEXT_MODEL, MAX_OUTPUT_TOKENS } from './chatBody.ts';
import { createGrants } from './grants.ts';
import { createFreeHandler, type FreeRequest, type FreeResponse } from './handler.ts';
import {
  FREE_MONTH_SECONDS,
  GLOBAL_MONTH_SECONDS,
  GRANT_GRACE_SECONDS,
  TICK_SECONDS,
  monthOf,
} from './plan.ts';
import { createMemoryUsage, type UsageStore } from './usage.ts';

const NOON = Date.UTC(2026, 10, 11, 12);
const MONTH = monthOf(NOON);
const ALICE = 'Bearer id-alice';

interface Sent {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  chunks: string[];
  ended: boolean;
}

function fakeResponse(): { res: FreeResponse; sent: Sent } {
  const sent: Sent = { status: 200, headers: {}, body: undefined, chunks: [], ended: false };
  const res: FreeResponse = {
    status: (code) => ((sent.status = code), res),
    set: (field, value) => ((sent.headers[field] = value), res),
    json: (body) => {
      sent.body = body;
      sent.ended = true;
    },
    write: (chunk) => (sent.chunks.push(new TextDecoder().decode(chunk)), true),
    end: () => {
      sent.ended = true;
    },
  };
  return { res, sent };
}

function request(path: string, auth = '', init: Partial<FreeRequest> = {}): FreeRequest {
  return { method: 'POST', path, body: {}, headers: auth ? { authorization: auth } : {}, ...init };
}

function codeOf(sent: Sent): string {
  return (sent.body as { error?: { code?: string } }).error?.code ?? '';
}

const CHAT = {
  model: 'gpt-6-astra',
  max_completion_tokens: 5000,
  messages: [
    { role: 'system', content: 'Translate' },
    { role: 'user', content: 'Hola' },
  ],
  stream: true,
};

function setup(reply: () => Response = () => Response.json({ value: 'temp-key-1' })) {
  const calls: { url: string; body: unknown; auth: string }[] = [];
  const fetchFake = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      auth: (init.headers as Record<string, string>).Authorization ?? '',
    });
    return reply();
  }) as typeof fetch;
  const grants = createGrants({ graceSeconds: GRANT_GRACE_SECONDS, callsPerTick: 2 });
  const usage: UsageStore = createMemoryUsage();
  let clock = NOON;
  const handle = createFreeHandler({
    grants,
    usage,
    verifyUser: async (token) => (token === 'id-alice' ? 'alice' : null),
    openAiKey: () => 'server-key',
    fetch: fetchFake,
    now: () => clock,
    log: () => undefined,
  });
  async function call(path: string, auth = '', body: unknown = {}): Promise<Sent> {
    const { res, sent } = fakeResponse();
    await handle(request(path, auth, { body }), res);
    return sent;
  }
  return { call, calls, grants, usage, advance: (ms: number) => (clock += ms) };
}

describe('free balance', () => {
  it('asks for a Google sign-in', async () => {
    const { call } = setup();
    const sent = await call('/api/free/balance', 'Bearer forged');
    assert.equal(sent.status, 401);
    assert.equal(codeOf(sent), 'free_signin');
  });

  it("tells the minutes left in this month's allowance", async () => {
    const { call, usage } = setup();
    await usage.charge('alice', MONTH, 600);
    const sent = await call('/api/free/balance', ALICE);
    assert.deepEqual(sent.body, {
      seconds: FREE_MONTH_SECONDS - 600,
      monthSeconds: FREE_MONTH_SECONDS,
      available: true,
    });
  });
});

describe('free session', () => {
  it('hands out a short-lived Medium key, never the server key, and pays the first stretch', async () => {
    const { call, calls, usage } = setup();
    const sent = await call('/api/free/session', ALICE);

    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body, {
      key: 'temp-key-1',
      seconds: FREE_MONTH_SECONDS - TICK_SECONDS,
      tickSeconds: TICK_SECONDS,
    });
    assert.equal(calls[0]?.url, 'https://api.openai.com/v1/realtime/client_secrets');
    assert.equal(calls[0]?.auth, 'Bearer server-key');
    assert.match(JSON.stringify(calls[0]?.body), /"type":"transcription".*"gpt-live-transcribe"/);
    assert.deepEqual(await usage.read('alice', MONTH), { user: TICK_SECONDS, total: TICK_SECONDS });
  });

  it('needs a signed-in account', async () => {
    const { call, calls } = setup();
    const sent = await call('/api/free/session');
    assert.equal(codeOf(sent), 'free_signin');
    assert.equal(calls.length, 0);
  });

  it("refuses once the month's minutes are used up", async () => {
    const { call, calls, usage } = setup();
    await usage.charge('alice', MONTH, FREE_MONTH_SECONDS);
    const sent = await call('/api/free/session', ALICE);
    assert.equal(sent.status, 429);
    assert.equal(codeOf(sent), 'free_month');
    assert.equal(calls.length, 0);
  });

  it("pauses for everyone once the month's budget is spent", async () => {
    const { call, usage } = setup();
    await usage.charge('bob', MONTH, GLOBAL_MONTH_SECONDS);
    assert.equal(codeOf(await call('/api/free/session', ALICE)), 'free_budget');
  });

  it('starts over each month', async () => {
    const { call, usage } = setup();
    await usage.charge('alice', '2026-10', FREE_MONTH_SECONDS);
    assert.equal((await call('/api/free/session', ALICE)).status, 200);
  });

  it('says the free minutes are unavailable when OpenAI refuses', async () => {
    const { call, usage } = setup(() => new Response('no', { status: 500 }));
    const sent = await call('/api/free/session', ALICE);
    assert.equal(sent.status, 502);
    assert.deepEqual(await usage.read('alice', MONTH), { user: 0, total: 0 });
  });
});

describe('free check-ins', () => {
  it('pay for each stretch and keep the key alive', async () => {
    const { call, usage, advance } = setup();
    await call('/api/free/session', ALICE);
    advance(60_000);
    const sent = await call('/api/free/tick', 'Bearer temp-key-1');
    assert.deepEqual(sent.body, { seconds: FREE_MONTH_SECONDS - 2 * TICK_SECONDS });
    advance(60_000);
    assert.equal((await call('/api/free/tick', 'Bearer temp-key-1')).status, 200);
    assert.equal((await usage.read('alice', MONTH)).user, 3 * TICK_SECONDS);
  });

  it('end a session that stopped checking in', async () => {
    const { call, advance } = setup();
    await call('/api/free/session', ALICE);
    advance((GRANT_GRACE_SECONDS + 1) * 1000);
    assert.equal(codeOf(await call('/api/free/tick', 'Bearer temp-key-1')), 'free_expired');
  });

  it('end the session when the minutes run out', async () => {
    const { call, usage } = setup();
    await call('/api/free/session', ALICE);
    await usage.charge('alice', MONTH, FREE_MONTH_SECONDS);
    assert.equal(codeOf(await call('/api/free/tick', 'Bearer temp-key-1')), 'free_month');
    const chat = await call('/api/free/v1/chat/completions', 'Bearer temp-key-1', CHAT);
    assert.equal(codeOf(chat), 'free_expired');
  });
});

describe('free translation proxy', () => {
  it('forwards a known key on the cheap model and streams the answer back', async () => {
    const { call, calls, grants } = setup(() => new Response('data: hi\n\n', { status: 200 }));
    grants.issue('temp-key-1', 'alice', NOON);
    const sent = await call('/api/free/v1/chat/completions', 'Bearer temp-key-1', CHAT);

    assert.equal(sent.status, 200);
    assert.deepEqual(sent.chunks, ['data: hi\n\n']);
    assert.ok(sent.ended);
    const body = calls[0]?.body as Record<string, unknown>;
    assert.equal(body.model, FREE_TEXT_MODEL);
    assert.equal(body.max_completion_tokens, MAX_OUTPUT_TOKENS);
    assert.equal(calls[0]?.auth, 'Bearer server-key');
  });

  it('refuses unknown keys and keys past their calls until the next check-in', async () => {
    const { call, grants } = setup(() => Response.json({}));
    grants.issue('temp-key-1', 'alice', NOON);
    const codes: number[] = [];
    for (const key of ['nope', 'temp-key-1', 'temp-key-1', 'temp-key-1']) {
      codes.push((await call('/api/free/v1/chat/completions', `Bearer ${key}`, CHAT)).status);
    }
    assert.deepEqual(codes, [401, 200, 200, 401]);
    grants.renew('temp-key-1', NOON);
    assert.equal(
      (await call('/api/free/v1/chat/completions', 'Bearer temp-key-1', CHAT)).status,
      200,
    );
  });

  it('only answers POST to its paths', async () => {
    const { call } = setup();
    const { res, sent } = fakeResponse();
    const handle = createFreeHandler({
      grants: createGrants({ graceSeconds: 1, callsPerTick: 1 }),
      usage: createMemoryUsage(),
      verifyUser: async () => null,
      openAiKey: () => '',
    });
    await handle(request('/api/free/session', '', { method: 'GET' }), res);
    const other = await call('/api/free/v1/audio/speech');
    assert.deepEqual([sent.status, other.status], [405, 404]);
  });
});

describe('freeChatBody', () => {
  it('rejects anything but a system and a user message', () => {
    assert.equal(freeChatBody({ messages: [{ role: 'user', content: 'x' }] }), null);
    assert.equal(
      freeChatBody({
        messages: [
          { role: 'assistant', content: 'x' },
          { role: 'user', content: 'y' },
        ],
      }),
      null,
    );
    assert.equal(
      freeChatBody({
        messages: [
          { role: 'system', content: 'x'.repeat(20_000) },
          { role: 'user', content: 'y' },
        ],
      }),
      null,
    );
  });

  it('keeps JSON mode and a smaller token limit', () => {
    const body = freeChatBody({
      ...CHAT,
      max_completion_tokens: 300,
      stream: false,
      response_format: { type: 'json_object' },
    });
    assert.equal(body?.max_completion_tokens, 300);
    assert.deepEqual(body?.response_format, { type: 'json_object' });
    assert.equal(body?.stream, undefined);
  });
});
