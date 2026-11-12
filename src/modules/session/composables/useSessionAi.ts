import { computed, onScopeDispose, ref, unref, watch, type ComputedRef, type Ref } from 'vue';
import { useSettingsStore } from '@/modules/settings';
import { isAbortError, logError } from '@/shared/errors';
import { i18n } from '@/shared/i18n';
import { openAiAssistant } from '@/shared/providers/openai/llm/assistant';
import { openAiLlm } from '@/shared/providers/openai/llm/openAiLlm';
import type { TextContext, Usage } from '@/shared/providers/types';
import { useSessionViewer } from '../store/useSessionViewer';
import type { SessionSnapshot } from '../types';
import { summarizeLines } from '../utils/summarizeLines';
import { transcriptOpening, transcriptText } from '../utils/transcriptText';

/** One thing asked of the assistant and what it wrote */
export interface AssistantTurn {
  id: number;
  /** What the reader sees it was: their question, or the name of the action */
  label: string;
  request: string;
  answer: string;
  status: 'writing' | 'done' | 'stopped' | 'failed';
}

export interface SessionAi {
  /** The person has a key of their own: all of this is paid with it */
  ready: ComputedRef<boolean>;
  canName: ComputedRef<boolean>;
  canSummarize: ComputedRef<boolean>;
  naming: Ref<boolean>;
  summarizing: Ref<boolean>;
  asking: Ref<boolean>;
  /** i18n key of why the last thing asked for by hand failed */
  errorKey: Ref<string | null>;
  /** What was asked in this visit, oldest first; gone when the page is left */
  turns: Ref<AssistantTurn[]>;
  /** Names the conversation. Quiet: a failure is only logged (it was not asked for). */
  name: (options?: { quiet?: boolean }) => Promise<boolean>;
  /** Writes the summary anew from the whole conversation */
  summarize: () => Promise<boolean>;
  ask: (request: string, label?: string) => Promise<boolean>;
  /** Stops the answer being written; what arrived stays */
  stop: () => void;
}

/** A name needs something said; a summary of fewer sentences is longer than they are */
const MIN_LINES_TO_NAME = 2;
const MIN_LINES_TO_SUMMARIZE = 4;
const SAME_LANGUAGE = 'the language of the transcript';
const EMPTY_KEY = 'session.view.summaryEmpty';

/** "es" → "Spanish": the prompts name the language to write in, in English */
function languageName(code: string): string {
  if (!code) return SAME_LANGUAGE;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.toLowerCase()) ?? code;
  } catch {
    return SAME_LANGUAGE;
  }
}

/**
 * What the AI does with the conversation on screen once it ended: name it, write its
 * summary again and work on its transcript (minutes, notes, questions). It is paid with
 * the person's own key, so none of it is offered without one, and what it costs is added
 * to the conversation. `onChanged` runs after anything worth keeping changed.
 */
export function useSessionAi(onChanged: () => void): SessionAi {
  const settings = useSettingsStore();
  const viewer = useSessionViewer();
  const naming = ref(false);
  const summarizing = ref(false);
  const asking = ref(false);
  const errorKey = ref<string | null>(null);
  const turns = ref<AssistantTurn[]>([]);
  let nextId = 1;
  const running = new Set<AbortController>();
  let answer: AbortController | null = null;

  const ready = computed(() => settings.keyLooksValid);
  const lineCount = computed(() => viewer.snapshot?.lines.length ?? 0);
  const canName = computed(() => ready.value && lineCount.value >= MIN_LINES_TO_NAME);
  const canSummarize = computed(() => ready.value && lineCount.value >= MIN_LINES_TO_SUMMARIZE);

  /** One call's context; what it spends is added to the conversation when it ends */
  function begin(snapshot: SessionSnapshot): {
    context: TextContext;
    controller: AbortController;
    /** Still the conversation on screen: false once it was closed or another opened */
    settle: () => boolean;
  } {
    const controller = new AbortController();
    const spent: Usage[] = [];
    running.add(controller);
    return {
      controller,
      context: {
        apiKey: settings.apiKey,
        endpoint: settings.endpoint,
        // Without a translation, the language the person reads the app in
        targetLanguage: languageName(snapshot.pair.to || String(unref(i18n.global.locale))),
        glossary: snapshot.glossary,
        model: settings.models.summary,
        signal: controller.signal,
        onUsage: (usage) => spent.push(usage),
      },
      settle: () => {
        running.delete(controller);
        if (viewer.snapshot?.startedAt !== snapshot.startedAt) return false;
        if (spent.length) {
          viewer.addUsage(spent);
          onChanged();
        }
        return true;
      },
    };
  }

  /** Why a call failed, for the reader; nothing for one that was stopped */
  function failure(label: string, err: unknown): string | null {
    return isAbortError(err) ? null : logError(label, err).userMessageKey;
  }

  async function name(options: { quiet?: boolean } = {}): Promise<boolean> {
    const snapshot = viewer.snapshot;
    if (!snapshot || naming.value || !canName.value) return false;
    naming.value = true;
    if (!options.quiet) errorKey.value = null;
    const call = begin(snapshot);
    try {
      const title = await openAiAssistant.title({
        ...call.context,
        transcript: transcriptOpening(snapshot.lines),
        summary: snapshot.summary,
      });
      if (!call.settle() || !title) return false;
      viewer.setTitle(title);
      onChanged();
      return true;
    } catch (err) {
      call.settle();
      const key = failure('Naming the conversation failed', err);
      if (!options.quiet) errorKey.value = key;
      return false;
    } finally {
      naming.value = false;
    }
  }

  async function summarize(): Promise<boolean> {
    const snapshot = viewer.snapshot;
    if (!snapshot || summarizing.value || !canSummarize.value) return false;
    summarizing.value = true;
    errorKey.value = null;
    const call = begin(snapshot);
    try {
      const points = await summarizeLines(
        openAiLlm,
        call.context,
        snapshot.lines.map((line) => line.source),
      );
      if (!call.settle()) return false;
      if (!points.length) {
        errorKey.value = EMPTY_KEY;
        return false;
      }
      viewer.setSummary(points);
      onChanged();
      return true;
    } catch (err) {
      call.settle();
      errorKey.value = failure('Writing the summary failed', err);
      return false;
    } finally {
      summarizing.value = false;
    }
  }

  async function ask(request: string, label: string = request): Promise<boolean> {
    const snapshot = viewer.snapshot;
    const wanted = request.trim();
    if (!snapshot || asking.value || !ready.value || !wanted) return false;
    asking.value = true;
    errorKey.value = null;
    const earlier = turns.value
      .filter((turn) => turn.status === 'done')
      .map((turn) => ({ request: turn.request, answer: turn.answer }));
    const id = nextId++;
    turns.value.push({ id, label: label.trim(), request: wanted, answer: '', status: 'writing' });
    /** The turn as the page sees it: gone when another conversation was opened meanwhile */
    const turn = (): AssistantTurn | undefined => turns.value.find((item) => item.id === id);
    const call = begin(snapshot);
    answer = call.controller;
    try {
      await openAiAssistant.ask(
        { ...call.context, transcript: transcriptText(snapshot.lines), request: wanted, earlier },
        (chunk) => {
          const writing = turn();
          if (writing) writing.answer += chunk;
        },
      );
      call.settle();
      const written = turn();
      if (written) written.status = written.answer.trim() ? 'done' : 'failed';
      return written?.status === 'done';
    } catch (err) {
      call.settle();
      const key = failure('The assistant could not answer', err);
      const broken = turn();
      if (broken) broken.status = key === null ? 'stopped' : 'failed';
      errorKey.value = key;
      return false;
    } finally {
      asking.value = false;
      if (answer === call.controller) answer = null;
    }
  }

  function stop(): void {
    answer?.abort();
  }

  function cancelAll(): void {
    for (const controller of running) controller.abort();
    running.clear();
  }

  // Another conversation: what was being written, and what was asked, belonged to the last
  watch(
    () => viewer.snapshot?.startedAt,
    () => {
      cancelAll();
      turns.value = [];
      errorKey.value = null;
    },
  );
  onScopeDispose(cancelAll);

  return {
    ready,
    canName,
    canSummarize,
    naming,
    summarizing,
    asking,
    errorKey,
    turns,
    name,
    summarize,
    ask,
    stop,
  };
}
