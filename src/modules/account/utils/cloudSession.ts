// How a conversation is laid out in Firestore: one document with what describes it, and
// its sentences in numbered chunks under it, since a document holds at most 1 MiB.
//
//   users/{uid}/sessions/{sessionId}            CloudSessionDoc (+ updatedAt)
//   users/{uid}/sessions/{sessionId}/chunks/{n} { lines: SessionLine[] } (CHUNK_SIZE each)

import type { SessionLine, SessionPair, SessionSnapshot, Usage } from '@/modules/session';

/** Sentences per chunk: even long sentences and their translations stay far below 1 MiB */
export const CHUNK_SIZE = 200;
/** Bumped when the layout changes, so older conversations can still be read */
export const CLOUD_SCHEMA_VERSION = 1;

/** The conversation document, without the server-set updatedAt */
export interface CloudSessionDoc {
  version: number;
  startedAt: number;
  endedAt: number | null;
  pair: SessionPair;
  glossary: string;
  summary: string[];
  usage: Usage[];
  lineCount: number;
  chunkSize: number;
}

export type CloudSessionSource = Pick<
  SessionSnapshot,
  'endedAt' | 'pair' | 'lines' | 'summary' | 'glossary' | 'usage'
>;

/** A conversation is named after when it began: one person starts one at a time */
export function cloudSessionId(startedAt: number): string {
  return String(startedAt);
}

export function toCloudSessionDoc(source: CloudSessionSource, startedAt: number): CloudSessionDoc {
  return {
    version: CLOUD_SCHEMA_VERSION,
    startedAt,
    endedAt: source.endedAt,
    pair: { from: source.pair.from, to: source.pair.to },
    glossary: source.glossary,
    summary: [...source.summary],
    usage: source.usage.map((entry) => ({ ...entry })),
    lineCount: source.lines.length,
    chunkSize: CHUNK_SIZE,
  };
}

/**
 * Chunks to write when `saved` sentences are already stored and there are `total` now:
 * the last, partly filled one again, and every new one.
 */
export function chunksToWrite(saved: number, total: number): number[] {
  if (total <= saved) return [];
  const first = Math.floor(saved / CHUNK_SIZE);
  const last = Math.floor((total - 1) / CHUNK_SIZE);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** The sentences of one chunk, as plain objects */
export function chunkLines(lines: readonly SessionLine[], index: number): SessionLine[] {
  return lines.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).map((line) => ({ ...line }));
}
