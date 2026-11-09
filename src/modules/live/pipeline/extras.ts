// The summary and the suggestions (replies in a conversation, questions about a talk):
// they run beside the captions and never block them.

import type {
  LlmProvider,
  SuggestRequest,
  SummaryRequest,
  TextContext,
} from '@/shared/providers/types';
import type { Run } from './run';
import type { OverlayStore, SessionSink, TextRole } from './types';

export interface ExtrasDeps {
  llm: LlmProvider;
  overlay: OverlayStore;
  record?: SessionSink;
  isLive: (run: Run) => boolean;
  context: (run: Run, role: TextRole) => TextContext;
  handleError: (run: Run, label: string, err: unknown) => void;
}

export interface Extras {
  summarize: (run: Run) => Promise<void>;
  suggest: (run: Run, lastLine: string) => Promise<void>;
}

const SUMMARY_EVERY = 4;
export const MAX_UNSUMMARIZED = 40;
const QUESTION = /[?？]/;
/** After a failed summary, wait this long before the next try, doubling up to the cap */
export const SUMMARY_RETRY_MS = 5000;
export const SUMMARY_RETRY_MAX_MS = 60_000;
/** Lines of the conversation a reply suggestion is written from; the summary adds the rest */
export const SUGGEST_CONTEXT_LINES = 15;
/** In a talk, new questions every this many sentences */
export const QUESTIONS_EVERY = 6;
/** Lines of a talk the questions are written from */
export const QUESTIONS_CONTEXT_LINES = 15;
/** Questions remembered so the model doesn't offer them again */
export const MAX_ASKED = 9;

export function createExtras({
  llm,
  overlay,
  record,
  isLive,
  context,
  handleError,
}: ExtrasDeps): Extras {
  async function summarize(run: Run): Promise<void> {
    if (run.summarizing || !overlay.options.summary || run.unsummarized.length < SUMMARY_EVERY)
      return;
    // A failing summary must not fire again on every sentence
    if (Date.now() < run.summaryRetryAt) return;
    run.summarizing = true;
    const newLines = run.unsummarized;
    run.unsummarized = [];
    try {
      const request: SummaryRequest = {
        ...context(run, 'summary'),
        summary: overlay.summary,
        newLines,
        mode: overlay.mode,
      };
      const points = await llm.summarize(request);
      if (isLive(run) && points.length) {
        overlay.setSummary(points);
        record?.setSummary(points);
      }
      run.summaryBackoffMs = 0;
      run.summaryRetryAt = 0;
    } catch (err) {
      if (isLive(run)) {
        run.unsummarized = [...newLines, ...run.unsummarized].slice(-MAX_UNSUMMARIZED);
        run.summaryBackoffMs = Math.min(
          SUMMARY_RETRY_MAX_MS,
          run.summaryBackoffMs ? run.summaryBackoffMs * 2 : SUMMARY_RETRY_MS,
        );
        run.summaryRetryAt = Date.now() + run.summaryBackoffMs;
      }
      handleError(run, 'Summary failed', err);
    } finally {
      run.summarizing = false;
    }
  }

  /** What a reply or a question builds on: the summary so far and the lines before the last. */
  function earlier(run: Run, lines: number): Pick<SuggestRequest, 'context' | 'summary'> {
    return { context: run.lines.slice(-lines - 1, -1), summary: [...overlay.summary] };
  }

  /** In a conversation: replies to what the other person just asked, and nothing otherwise. */
  async function suggestReplies(run: Run, lastLine: string): Promise<void> {
    const seq = ++run.suggestSeq;
    overlay.setSuggestions([]);
    if (!QUESTION.test(lastLine)) return;
    try {
      const request: SuggestRequest = {
        ...context(run, 'suggestions'),
        ...earlier(run, SUGGEST_CONTEXT_LINES),
        lastLine,
        mode: 'conversation',
      };
      const replies = await llm.suggest(request);
      const current = isLive(run) && seq === run.suggestSeq && overlay.mode === 'conversation';
      if (current) overlay.setSuggestions(replies);
    } catch (err) {
      handleError(run, 'Reply suggestions failed', err);
    }
  }

  /**
   * In a talk nobody asks the listener anything, and a speaker's rhetorical "?" is no cue:
   * questions they could ask come every few sentences, and stay until better ones arrive.
   */
  async function suggestQuestions(run: Run, lastLine: string): Promise<void> {
    if (run.asking || run.sinceQuestions < QUESTIONS_EVERY) return;
    run.asking = true;
    run.sinceQuestions = 0;
    const seq = ++run.suggestSeq;
    try {
      const request: SuggestRequest = {
        ...context(run, 'suggestions'),
        ...earlier(run, QUESTIONS_CONTEXT_LINES),
        lastLine,
        mode: 'talk',
        asked: [...run.asked],
      };
      const questions = await llm.suggest(request);
      const current = isLive(run) && seq === run.suggestSeq && overlay.mode === 'talk';
      // Nothing new worth asking: the questions already shown are still good
      if (!current || !questions.length) return;
      overlay.setSuggestions(questions);
      run.asked = [...run.asked, ...questions.map((question) => question.mine)].slice(-MAX_ASKED);
    } catch (err) {
      handleError(run, 'Question suggestions failed', err);
    } finally {
      run.asking = false;
    }
  }

  async function suggest(run: Run, lastLine: string): Promise<void> {
    // Counted even while off, so turning questions on mid-talk asks for some at once
    run.sinceQuestions++;
    if (!overlay.options.suggestions) return;
    if (overlay.mode === 'talk') await suggestQuestions(run, lastLine);
    else await suggestReplies(run, lastLine);
  }

  return { summarize, suggest };
}
