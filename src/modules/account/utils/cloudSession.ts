// How a conversation is laid out in Firestore: one document with what describes it, and
// its sentences in numbered chunks under it, since a document holds at most 1 MiB.
//
//   users/{uid}/sessions/{sessionId}            CloudSessionDoc (+ updatedAt, and the
//                                               person's own title and starred, if set)
//   users/{uid}/sessions/{sessionId}/chunks/{n} { lines: SessionLine[] } (CHUNK_SIZE each)

import {
  cleanTitle,
  parseSnapshot,
  TITLE_MAX,
  type SessionLine,
  type SessionPair,
  type SessionSnapshot,
  type Usage,
} from '@/modules/session';

// The name of a conversation and its limits belong to the session module
export { cleanTitle, TITLE_MAX };

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
  /** Only once the conversation has a name, so a save never erases one given elsewhere */
  title?: string;
}

export type CloudSessionSource = Pick<
  SessionSnapshot,
  'endedAt' | 'pair' | 'lines' | 'summary' | 'glossary' | 'usage' | 'title'
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
    ...(source.title ? { title: cleanTitle(source.title) } : {}),
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

/** One conversation of the account, as the history lists it (its sentences not read yet) */
export interface CloudHistoryItem {
  id: string;
  startedAt: number;
  endedAt: number | null;
  pair: SessionPair;
  lineCount: number;
  /** The name the person gave it; empty until they do */
  title: string;
  starred: boolean;
  summary: string[];
  glossary: string;
  usage: Usage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ItemDetails = Pick<CloudHistoryItem, 'summary' | 'glossary' | 'usage'>;

/** The checked summary, terms and usage of a document; empty when any is malformed */
function details(data: Record<string, unknown>): ItemDetails {
  try {
    const snapshot = parseSnapshot({ ...data, lines: [] });
    return {
      summary: [...snapshot.summary],
      glossary: snapshot.glossary,
      usage: snapshot.usage.map((entry) => ({ ...entry })),
    };
  } catch {
    return { summary: [], glossary: '', usage: [] };
  }
}

/** A history entry from a conversation document; null when it is not one of ours */
export function toHistoryItem(id: string, data: unknown): CloudHistoryItem | null {
  if (!isRecord(data) || typeof data.startedAt !== 'number') return null;
  const pair = isRecord(data.pair) ? data.pair : {};
  return {
    id,
    startedAt: data.startedAt,
    endedAt: typeof data.endedAt === 'number' ? data.endedAt : null,
    pair: {
      from: typeof pair.from === 'string' ? pair.from : '',
      to: typeof pair.to === 'string' ? pair.to : '',
    },
    lineCount: typeof data.lineCount === 'number' ? data.lineCount : 0,
    title: typeof data.title === 'string' ? data.title.slice(0, TITLE_MAX) : '',
    starred: data.starred === true,
    ...details(data),
  };
}

/**
 * The plain session a conversation document and its chunks (in order) make up, ready
 * for the session module to check like a session file.
 */
export function fromCloudSession(data: unknown, chunks: readonly unknown[]): unknown {
  const doc = isRecord(data) ? data : {};
  const lines = chunks.flatMap((chunk) =>
    isRecord(chunk) && Array.isArray(chunk.lines) ? (chunk.lines as unknown[]) : [],
  );
  return {
    title: doc.title,
    startedAt: doc.startedAt,
    endedAt: doc.endedAt ?? null,
    pair: doc.pair,
    lines,
    summary: doc.summary,
    glossary: doc.glossary,
    usage: doc.usage,
  };
}
