import { AppError, ExternalServiceError, NotFoundError, isAbortError } from '@/shared/errors';
import type { Usage } from '../../types';
import {
  INTERPRETER_MODEL,
  INTERPRETER_SOURCE_MODEL,
  NO_EFFORT_NONE_FAMILY,
  REASONING_FAMILY,
  TIER_MODELS,
} from '../config';
import { type OpenAiAccess, apiBase, authHeaders } from '../endpoint';
import { errorFromResponse, networkError } from '../errors';
import { readSseFrames } from './sse';

export interface ChatRequest extends OpenAiAccess {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  json?: boolean;
  signal?: AbortSignal;
  onUsage?: (usage: Usage) => void;
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

interface ChatChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: ChatUsage | null;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
  usage?: ChatUsage | null;
}

function count(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** OpenAI's usage block in the shape the cost estimate understands. */
function toUsage(model: string, usage: ChatUsage): Usage {
  return {
    model,
    inputTokens: count(usage.prompt_tokens),
    cachedInputTokens: count(usage.prompt_tokens_details?.cached_tokens),
    outputTokens: count(usage.completion_tokens),
  };
}

/** The lowest effort the model accepts; without it, reasoning models take seconds per sentence */
function reasoningEffort(model: string): 'none' | 'low' | undefined {
  if (!REASONING_FAMILY.test(model)) return undefined;
  return NO_EFFORT_NONE_FAMILY.test(model) ? 'low' : 'none';
}

function body(request: ChatRequest, stream: boolean): string {
  const effort = reasoningEffort(request.model);
  return JSON.stringify({
    model: request.model,
    ...(effort ? { reasoning_effort: effort } : {}),
    max_completion_tokens: request.maxTokens,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    ...(request.json ? { response_format: { type: 'json_object' } } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });
}

async function post(request: ChatRequest, stream: boolean): Promise<Response> {
  const url = `${apiBase(request)}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(request), 'Content-Type': 'application/json' },
      body: body(request, stream),
      signal: request.signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!response.ok) {
    throw errorFromResponse(response.status, await response.text(), request.apiKey);
  }
  return response;
}

function reportUsage(request: ChatRequest, usage: ChatUsage | null | undefined): void {
  if (usage && request.onUsage) request.onUsage(toUsage(request.model, usage));
}

/** Streams the reply, calling `onDelta` with each new piece of text. */
export async function streamChat(
  request: ChatRequest,
  onDelta: (chunk: string) => void,
): Promise<void> {
  const response = await post(request, true);
  if (!response.body) throw new ExternalServiceError('OpenAI returned an empty stream');
  try {
    await readSseFrames<ChatChunk>(
      response.body,
      (frame) => {
        const chunk = frame.choices?.[0]?.delta?.content;
        if (chunk) onDelta(chunk);
        // With include_usage the last chunk has no choices and carries the totals
        reportUsage(request, frame.usage);
      },
      request.signal,
    );
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw networkError(err);
  }
}

export async function completeChat(request: ChatRequest): Promise<string> {
  const response = await post(request, false);
  let data: ChatCompletion;
  try {
    data = (await response.json()) as ChatCompletion;
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ExternalServiceError('OpenAI returned an unreadable reply', 'errors.service', err);
  }
  reportUsage(request, data.usage);
  return data.choices?.[0]?.message?.content ?? '';
}

/** Models the app ships with: known to exist, so never second-guessed against the list */
const KNOWN_MODELS: ReadonlySet<string> = new Set([
  INTERPRETER_MODEL,
  INTERPRETER_SOURCE_MODEL,
  ...Object.values(TIER_MODELS).flatMap((tier) => Object.values(tier)),
]);

interface ModelList {
  data?: { id?: unknown }[];
}

/** The first typed model name the account does not have, or null. */
async function missingModel(response: Response, models: readonly string[]): Promise<string | null> {
  const custom = models.filter((model) => model && !KNOWN_MODELS.has(model));
  if (!custom.length) return null;
  let list: ModelList;
  try {
    list = (await response.json()) as ModelList;
  } catch {
    return null;
  }
  const ids = new Set((list.data ?? []).map((model) => model.id).filter(Boolean));
  // An empty or odd list proves nothing: better to start than to block on it
  if (!ids.size) return null;
  return custom.find((model) => !ids.has(model)) ?? null;
}

/**
 * Cheap call to check a key before starting a session, and with it the model names the
 * user typed in the settings: a typo is caught here, before any audio is sent and billed.
 * Only on OpenAI: Azure lists base models, not the deployment names the settings hold.
 */
export async function verifyApiKey(
  access: OpenAiAccess,
  models: readonly string[] = [],
): Promise<AppError | null> {
  try {
    const response = await fetch(`${apiBase(access)}/models`, { headers: authHeaders(access) });
    if (!response.ok) {
      return errorFromResponse(response.status, await response.text(), access.apiKey);
    }
    if (access.endpoint !== undefined) return null;
    const missing = await missingModel(response, models);
    return missing
      ? new NotFoundError(`Model not available to this key: ${missing}`, 'errors.modelNotFound')
      : null;
  } catch (err) {
    return err instanceof AppError ? err : networkError(err);
  }
}
