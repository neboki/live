import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Usage } from '../../types';
import { type ChatRequest, completeChat, streamChat, verifyApiKey } from './chat';
import { OPENAI_API } from '../config';

const fetchMock = vi.fn<typeof fetch>();

function request(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    apiKey: 'sk-k',
    model: 'gpt-6-luna',
    system: 'S',
    user: 'U',
    maxTokens: 10,
    ...overrides,
  };
}

function sse(...chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function frame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

function errorResponse(status: number, code = ''): Response {
  return new Response(JSON.stringify({ error: { message: 'x', code } }), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('error mapping', () => {
  it.each([
    [401, '', 'errors.invalidKey'],
    [429, 'insufficient_quota', 'errors.noCredit'],
    [429, 'rate_limit_exceeded', 'errors.rateLimited'],
    [500, '', 'errors.service'],
  ])('maps %i %s to %s', async (status, code, key) => {
    fetchMock.mockResolvedValue(errorResponse(status, code));

    await expect(completeChat(request())).rejects.toMatchObject({ userMessageKey: key });
  });

  it('maps a network failure to connectionFailed', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(completeChat(request())).rejects.toMatchObject({
      userMessageKey: 'errors.connectionFailed',
    });
  });

  it('passes the signal to fetch and does not wrap an abort', async () => {
    const controller = new AbortController();
    const abort = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abort);
    controller.abort();

    await expect(streamChat(request({ signal: controller.signal }), vi.fn())).rejects.toBe(abort);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});

describe('request body', () => {
  it('sends reasoning_effort only to the gpt-6 family', async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [] }));
    await completeChat(request({ model: 'gpt-6-luna' }));
    expect(sentBody().reasoning_effort).toBe('none');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(Response.json({ choices: [] }));
    await completeChat(request({ model: 'gpt-4.1-mini' }));
    expect(sentBody()).not.toHaveProperty('reasoning_effort');
  });

  it('sends low effort to models that reject none', async () => {
    for (const model of ['gpt-6.1-sol', 'gpt-6-astra']) {
      fetchMock.mockClear();
      fetchMock.mockResolvedValue(Response.json({ choices: [] }));
      await completeChat(request({ model }));
      expect(sentBody().reasoning_effort).toBe('low');
    }
  });

  it('asks for a JSON object when json is set', async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [] }));
    await completeChat(request({ json: true }));

    expect(sentBody().response_format).toEqual({ type: 'json_object' });
  });

  it('sends the key as a Bearer header', async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [] }));
    await completeChat(request());
    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe(`${OPENAI_API}/chat/completions`);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-k');
  });
});

describe('streamChat', () => {
  it('emits deltas in order across chunk splits and reports usage', async () => {
    const usage = {
      prompt_tokens: 50,
      completion_tokens: 7,
      prompt_tokens_details: { cached_tokens: 40 },
    };
    const text =
      frame({ choices: [{ delta: { content: 'Ho' } }] }) +
      frame({ choices: [{ delta: { content: 'la' } }] });
    fetchMock.mockResolvedValue(
      sse(text.slice(0, 20), text.slice(20), frame({ choices: [], usage }), 'data: [DONE]\n\n'),
    );
    const deltas: string[] = [];
    const reports: Usage[] = [];

    await streamChat(request({ onUsage: (u) => reports.push(u) }), (chunk) => deltas.push(chunk));

    expect(deltas).toEqual(['Ho', 'la']);
    expect(sentBody()).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(reports).toEqual([
      { model: 'gpt-6-luna', inputTokens: 50, cachedInputTokens: 40, outputTokens: 7 },
    ]);
  });

  it('throws on an empty body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(streamChat(request(), vi.fn())).rejects.toMatchObject({
      userMessageKey: 'errors.service',
    });
  });
});

describe('completeChat', () => {
  it('returns an empty string when there are no choices', async () => {
    fetchMock.mockResolvedValue(Response.json({}));

    await expect(completeChat(request())).resolves.toBe('');
  });

  it('returns the content and reports usage', async () => {
    const onUsage = vi.fn();
    fetchMock.mockResolvedValue(
      Response.json({
        choices: [{ message: { content: 'Hi' } }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      }),
    );

    await expect(completeChat(request({ onUsage }))).resolves.toBe('Hi');
    expect(onUsage).toHaveBeenCalledWith({
      model: 'gpt-6-luna',
      inputTokens: 3,
      cachedInputTokens: 0,
      outputTokens: 1,
    });
    expect(sentBody()).not.toHaveProperty('stream_options');
  });
});

describe('verifyApiKey', () => {
  it('returns null for a valid key', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [] }));

    await expect(verifyApiKey({ apiKey: 'sk-k' })).resolves.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${OPENAI_API}/models`);
  });

  it('returns invalidKey for a 401', async () => {
    fetchMock.mockResolvedValue(errorResponse(401));

    await expect(verifyApiKey({ apiKey: 'sk-k' })).resolves.toMatchObject({
      userMessageKey: 'errors.invalidKey',
    });
  });

  it('returns connectionFailed when offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(verifyApiKey({ apiKey: 'sk-k' })).resolves.toMatchObject({
      userMessageKey: 'errors.connectionFailed',
    });
  });
});

describe('Azure OpenAI', () => {
  const AZURE = 'https://my-res.openai.azure.com';

  it('posts to the resource v1 API with an api-key header', async () => {
    fetchMock.mockResolvedValue(Response.json({ choices: [{ message: { content: 'hi' } }] }));

    await expect(completeChat(request({ apiKey: 'az', endpoint: AZURE }))).resolves.toBe('hi');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${AZURE}/openai/v1/chat/completions`);
    expect(init?.headers).toMatchObject({ 'api-key': 'az' });
    expect(init?.headers).not.toHaveProperty('Authorization');
  });

  it('verifies the key against the resource', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [] }));

    await expect(verifyApiKey({ apiKey: 'az', endpoint: AZURE })).resolves.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${AZURE}/openai/v1/models`);
  });

  it('never sends the key anywhere for an invalid endpoint', async () => {
    await expect(
      verifyApiKey({ apiKey: 'az', endpoint: 'https://evil.example.com' }),
    ).resolves.toMatchObject({ userMessageKey: 'errors.invalidEndpoint' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a missing deployment', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, 'DeploymentNotFound'));

    await expect(completeChat(request({ endpoint: AZURE }))).rejects.toMatchObject({
      userMessageKey: 'errors.deploymentNotFound',
    });
  });
});
