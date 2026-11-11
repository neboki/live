import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { SessionBegin, SessionLine, SessionPair, Usage } from '../types';

function mergeUsage(current: Usage, next: Usage): Usage {
  const merged: Usage = {
    model: current.model,
    inputTokens: current.inputTokens + next.inputTokens,
    cachedInputTokens: current.cachedInputTokens + next.cachedInputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
  };
  if (current.audioSeconds !== undefined || next.audioSeconds !== undefined) {
    merged.audioSeconds = (current.audioSeconds ?? 0) + (next.audioSeconds ?? 0);
  }
  if (current.characters !== undefined || next.characters !== undefined) {
    merged.characters = (current.characters ?? 0) + (next.characters ?? 0);
  }
  return merged;
}

/**
 * The current session only (no history): what was heard and translated, the summary,
 * the glossary and the tokens spent. It survives the end of a session so it can be
 * exported, and is cleared by the next begin(). overlay.reset() does not touch it.
 */
export const useSessionRecord = defineStore('session-record', () => {
  const startedAt = ref<number | null>(null);
  const endedAt = ref<number | null>(null);
  const pair = ref<SessionPair>({ from: '', to: '' });
  const lines = ref<SessionLine[]>([]);
  const summary = ref<string[]>([]);
  const glossary = ref('');
  const usage = ref<Usage[]>([]);

  const durationMs = computed<number>(() => {
    if (startedAt.value === null) return 0;
    const end = endedAt.value ?? Date.now();
    return Math.max(0, end - startedAt.value);
  });

  function begin(options: SessionBegin): void {
    startedAt.value = options.startedAt;
    endedAt.value = null;
    pair.value = { ...options.pair };
    lines.value = [];
    summary.value = [];
    glossary.value = options.glossary ?? '';
    usage.value = [];
  }

  function addLine(line: SessionLine): void {
    lines.value.push({ ...line });
  }

  function setSummary(points: readonly string[]): void {
    summary.value = [...points];
  }

  function setGlossary(text: string): void {
    glossary.value = text;
  }

  function addUsage(entry: Usage): void {
    const index = usage.value.findIndex((item) => item.model === entry.model);
    const current = usage.value[index];
    if (current) usage.value[index] = mergeUsage(current, entry);
    else usage.value.push({ ...entry });
  }

  function end(): void {
    if (startedAt.value !== null && endedAt.value === null) endedAt.value = Date.now();
  }

  return {
    startedAt,
    endedAt,
    pair,
    lines,
    summary,
    glossary,
    usage,
    durationMs,
    begin,
    addLine,
    setSummary,
    setGlossary,
    addUsage,
    end,
  };
});
