import { logError } from '@/shared/errors';
import type { LlmProvider, ReplySuggestion, TextContext } from '../../types';
import { type ChatRequest, completeChat, streamChat } from './chat';
import { MODELS, TOKENS } from '../config';
import {
  QUESTIONS_PROMPT,
  SUGGEST_PROMPT,
  SUMMARY_PROMPT,
  TALK_SUMMARY_PROMPT,
  TRANSLATE_PROMPT,
  parsePoints,
  questionsMessage,
  suggestMessage,
  summaryMessage,
  translateMessage,
} from './prompts';

const MAX_REPLIES = 3;
const MAX_REPLY_CHARS = 200;

function isReply(value: unknown): value is ReplySuggestion {
  if (typeof value !== 'object' || value === null) return false;
  const reply = value as Record<string, unknown>;
  return typeof reply.mine === 'string' && typeof reply.theirs === 'string';
}

/**
 * Reads {"replies":[...]} (or {"questions":[...]} for a talk) defensively: the model can
 * wrap it in fences, skip fields, use the other key or send junk.
 */
export function parseReplies(text: string): ReplySuggestion[] {
  const json = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
  try {
    const data = JSON.parse(json) as { replies?: unknown; questions?: unknown } | null;
    const list = data?.replies ?? data?.questions;
    const replies: unknown[] = Array.isArray(list) ? list : [];
    return replies
      .filter(isReply)
      .map((reply) => ({
        mine: reply.mine.trim().slice(0, MAX_REPLY_CHARS),
        theirs: reply.theirs.trim().slice(0, MAX_REPLY_CHARS),
      }))
      .filter((reply) => reply.mine && reply.theirs)
      .slice(0, MAX_REPLIES);
  } catch (err) {
    logError('Unreadable reply suggestions', err);
    return [];
  }
}

/** The fields every chat call takes from the request context. */
function fromContext(
  context: TextContext,
  model: string,
): Pick<ChatRequest, 'apiKey' | 'endpoint' | 'model' | 'signal' | 'onUsage'> {
  return {
    apiKey: context.apiKey,
    endpoint: context.endpoint,
    model: context.model ?? model,
    signal: context.signal,
    onUsage: context.onUsage,
  };
}

export const openAiLlm: LlmProvider = {
  translate: (request, onDelta) =>
    streamChat(
      {
        ...fromContext(request, MODELS.translation),
        system: TRANSLATE_PROMPT,
        user: translateMessage(request),
        maxTokens: TOKENS.translation,
      },
      onDelta,
    ),

  summarize: async (request) =>
    parsePoints(
      await completeChat({
        ...fromContext(request, MODELS.summary),
        system: request.mode === 'talk' ? TALK_SUMMARY_PROMPT : SUMMARY_PROMPT,
        user: summaryMessage(request),
        maxTokens: TOKENS.summary,
      }),
    ),

  suggest: async (request) =>
    parseReplies(
      await completeChat({
        ...fromContext(request, MODELS.suggestions),
        // One fixed system prompt per mode, so each stays cached
        system: request.mode === 'talk' ? QUESTIONS_PROMPT : SUGGEST_PROMPT,
        user: request.mode === 'talk' ? questionsMessage(request) : suggestMessage(request),
        maxTokens: TOKENS.suggestions,
        json: true,
      }),
    ),
};
