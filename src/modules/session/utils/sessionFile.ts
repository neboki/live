// A saved conversation: the session snapshot wrapped in a small, versioned envelope so the
// app can recognise its own files and open them again. Plain JSON, readable by anyone.

import { ValidationError } from '@/shared/errors';
import type { SessionLine, SessionSnapshot, Usage } from '../types';

export interface SessionFile {
  format: typeof SESSION_FORMAT;
  version: typeof SESSION_FILE_VERSION;
  exportedAt: string;
  session: SessionSnapshot;
}

type Json = Record<string, unknown>;

export const SESSION_FORMAT = 'neboki-live.session';
const SESSION_FILE_VERSION = 1;
export const SESSION_FILE_EXTENSION = '.neboki-live.json';
/** Hours of conversation are a few MB; anything far bigger is not one of ours */
export const MAX_SESSION_FILE_BYTES = 20 * 1024 * 1024;
const USER_MESSAGE_KEY = 'errors.sessionFile';
/** Longest name of a conversation (kept in step with firestore.rules) */
export const TITLE_MAX = 120;

/** A name as it is kept: on one line, trimmed, at most TITLE_MAX characters */
export function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

function invalid(reason: string): ValidationError {
  return new ValidationError(`Not a Neboki Live session file: ${reason}`, USER_MESSAGE_KEY);
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalid(`${field} is not text`);
  return value;
}

function time(value: unknown, field: string): number {
  if (!isTime(value)) throw invalid(`${field} is not a time`);
  return value;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw invalid(`${field} is not a list`);
  return value;
}

function parseLine(value: unknown, index: number): SessionLine {
  if (!isObject(value)) throw invalid(`line ${index} is not an object`);
  const line: SessionLine = {
    at: time(value.at, `line ${index} time`),
    source: text(value.source, `line ${index} source`),
    translation: text(value.translation ?? '', `line ${index} translation`),
  };
  if (isTime(value.from) && value.from <= line.at) line.from = value.from;
  if (typeof value.language === 'string') line.language = value.language;
  if (Number.isInteger(value.speaker) && (value.speaker as number) >= 0) {
    line.speaker = value.speaker as number;
  }
  return line;
}

function parseUsage(value: unknown, index: number): Usage {
  if (!isObject(value)) throw invalid(`usage ${index} is not an object`);
  const count = (field: string): number => time(value[field] ?? 0, `usage ${index} ${field}`);
  const usage: Usage = {
    model: text(value.model, `usage ${index} model`),
    inputTokens: count('inputTokens'),
    cachedInputTokens: count('cachedInputTokens'),
    outputTokens: count('outputTokens'),
  };
  if (value.audioSeconds !== undefined) usage.audioSeconds = count('audioSeconds');
  if (value.characters !== undefined) usage.characters = count('characters');
  return usage;
}

/** Checks a plain session (from a file or the account) and keeps only known fields. */
export function parseSnapshot(value: unknown): SessionSnapshot {
  if (!isObject(value)) throw invalid('no session');
  const pair = isObject(value.pair) ? value.pair : {};
  const title = typeof value.title === 'string' ? cleanTitle(value.title) : '';
  return {
    ...(title ? { title } : {}),
    startedAt: time(value.startedAt, 'start'),
    endedAt:
      value.endedAt === null || value.endedAt === undefined ? null : time(value.endedAt, 'end'),
    pair: {
      from: text(pair.from ?? '', 'source language'),
      to: text(pair.to ?? '', 'target language'),
    },
    lines: list(value.lines ?? [], 'lines').map(parseLine),
    summary: list(value.summary ?? [], 'summary').map((point, i) => text(point, `summary ${i}`)),
    glossary: text(value.glossary ?? '', 'glossary'),
    usage: list(value.usage ?? [], 'usage').map(parseUsage),
  };
}

/** Plain copy of a snapshot (store refs and proxies are left behind). */
export function cloneSnapshot(record: SessionSnapshot): SessionSnapshot {
  return {
    ...(record.title ? { title: record.title } : {}),
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    pair: { ...record.pair },
    lines: record.lines.map((line) => ({ ...line })),
    summary: [...record.summary],
    glossary: record.glossary,
    usage: record.usage.map((entry) => ({ ...entry })),
  };
}

/** The session as a pretty-printed session file. */
export function toSessionFile(record: SessionSnapshot, now: Date = new Date()): string {
  const file: SessionFile = {
    format: SESSION_FORMAT,
    version: SESSION_FILE_VERSION,
    exportedAt: now.toISOString(),
    session: cloneSnapshot(record),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Reads a session file back. Throws a ValidationError (shown to the user as
 * `errors.sessionFile`) when the text is not JSON, not ours, from a newer version, or
 * has a field of the wrong type. Unknown fields are ignored.
 */
export function parseSessionFile(content: string): SessionSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new ValidationError('Session file is not JSON', USER_MESSAGE_KEY, err);
  }
  if (!isObject(data) || data.format !== SESSION_FORMAT) throw invalid('unknown format');
  if (data.version !== SESSION_FILE_VERSION) {
    throw new ValidationError(
      `Unsupported session file version ${String(data.version)}`,
      'errors.sessionFileVersion',
    );
  }
  return parseSnapshot(data.session);
}
