import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { demoChatBody, DEMO_TEXT_MODEL, MAX_OUTPUT_TOKENS } from './chatBody.ts';
import { createGrants } from './grants.ts';
import { createDemoHandler, type DemoRequest, type DemoResponse } from './handler.ts';

const LIMITS = { perClient: 2, perDay: 3, callsPerGrant: 2, grantSeconds: 60 };
const NOON = Date.UTC(2026, 10, 9, 12);

interface Sent {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  chunks: string[];
  ended: boolean;
}

function fakeResponse(): { res: DemoResponse; sent: Sent } {
  const sent: Sent = { status: 200, headers: {}, body: undefined, chunks: [], ended: false };
  const res: DemoResponse = {
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

function request(path: string, init: Partial<DemoRequest> = {}): DemoRequest {
  return { method: 'POST', path, body: {}, headers: {}, ...init };
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
  const grants = createGrants(LIMITS);
  const handle = createDemoHandler({
    grants,
    openAiKey: () => 'server-key',
    demoSeconds: 180,
    fetch: fetchFake,
    now: () => NOON,
    log: () => undefined,
  });
  return { handle, calls, grants };
}

describe('demo session', () => {
  it('hands out a short-lived transcription key, never the server key', async () => {
    const { handle, calls } = setup();
    const { res, sent } = fakeResponse();
    await handle(request('/api/demo/session'), res);

    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body, { key: 'temp-key-1', seconds: 180 });
    assert.equal(calls[0]?.url, 'https://api.openai.com/v1/realtime/client_secrets');
    assert.equal(calls[0]?.auth, 'Bearer server-key');
    assert.match(JSON.stringify(calls[0]?.body), /"type":"transcription".*"gpt-transcribe"/);
  });

  it('refuses a client past its daily demos, and everyone past the day total', async () => {
    const { handle } = setup();
    const statuses: unknown[] = [];
    for (const ip of ['1.1.1.1', '1.1.1.1', '1.1.1.1', '2.2.2.2', '3.3.3.3']) {
      const { res, sent } = fakeResponse();
      await handle(request('/api/demo/session', { headers: { 'x-forwarded-for': ip } }), res);
      statuses.push(
        sent.status === 200 ? 200 : (sent.body as { error: { code: string } }).error.code,
      );
    }
    assert.deepEqual(statuses, [200, 200, 'demo_client', 200, 'demo_day']);
  });

  it('says the demo is unavailable when OpenAI refuses', async () => {
    const { handle } = setup(() => new Response('no', { status: 500 }));
    const { res, sent } = fakeResponse();
    await handle(request('/api/demo/session'), res);
    assert.equal(sent.status, 502);
  });
});

describe('demo translation proxy', () => {
  it('forwards a known key on the cheap model and streams the answer back', async () => {
    const { handle, calls, grants } = setup(() => new Response('data: hi\n\n', { status: 200 }));
    grants.issue('temp-key-1', NOON);
    const { res, sent } = fakeResponse();
    await handle(
      request('/api/demo/v1/chat/completions', {
        body: CHAT,
        headers: { authorization: 'Bearer temp-key-1' },
      }),
      res,
    );

    assert.equal(sent.status, 200);
    assert.deepEqual(sent.chunks, ['data: hi\n\n']);
    assert.ok(sent.ended);
    const body = calls[0]?.body as Record<string, unknown>;
    assert.equal(body.model, DEMO_TEXT_MODEL);
    assert.equal(body.max_completion_tokens, MAX_OUTPUT_TOKENS);
    assert.equal(calls[0]?.auth, 'Bearer server-key');
  });

  it('refuses unknown keys and keys that used up their calls', async () => {
    const { handle, grants } = setup(() => Response.json({}));
    grants.issue('temp-key-1', NOON);
    const codes: number[] = [];
    for (const key of ['nope', 'temp-key-1', 'temp-key-1', 'temp-key-1']) {
      const { res, sent } = fakeResponse();
      await handle(
        request('/api/demo/v1/chat/completions', {
          body: CHAT,
          headers: { authorization: `Bearer ${key}` },
        }),
        res,
      );
      codes.push(sent.status);
    }
    assert.deepEqual(codes, [401, 200, 200, 401]);
  });

  it('forgets a key once it expires', () => {
    const grants = createGrants(LIMITS);
    grants.issue('temp-key-1', NOON);
    assert.equal(grants.spend('temp-key-1', NOON + 61_000), false);
  });

  it('only answers POST to its two paths', async () => {
    const { handle } = setup();
    const get = fakeResponse();
    await handle(request('/api/demo/session', { method: 'GET' }), get.res);
    const other = fakeResponse();
    await handle(request('/api/demo/v1/audio/speech'), other.res);
    assert.deepEqual([get.sent.status, other.sent.status], [405, 404]);
  });
});

describe('demoChatBody', () => {
  it('rejects anything but a system and a user message', () => {
    assert.equal(demoChatBody({ messages: [{ role: 'user', content: 'x' }] }), null);
    assert.equal(
      demoChatBody({
        messages: [
          { role: 'assistant', content: 'x' },
          { role: 'user', content: 'y' },
        ],
      }),
      null,
    );
    assert.equal(
      demoChatBody({
        messages: [
          { role: 'system', content: 'x'.repeat(20_000) },
          { role: 'user', content: 'y' },
        ],
      }),
      null,
    );
  });

  it('keeps JSON mode and a smaller token limit', () => {
    const body = demoChatBody({
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
