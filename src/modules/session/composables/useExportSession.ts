import { computed, unref, type ComputedRef } from 'vue';
import { i18n } from '@/shared/i18n';
import { useSessionRecord } from '../store/useSessionRecord';
import type { MarkdownLabels, SessionSnapshot } from '../types';
import { downloadText } from '../utils/download';
import { SESSION_FILE_EXTENSION, toSessionFile } from '../utils/sessionFile';
import { toMarkdown } from '../utils/toMarkdown';
import { toSubtitles, type SubtitleFormat } from '../utils/toSubtitles';

export interface ExportSessionState {
  /** True once a session has begun, so there is something to export */
  canExport: ComputedRef<boolean>;
  exportSession: () => boolean;
}

const LABEL_KEYS: Readonly<Record<keyof MarkdownLabels, string>> = {
  title: 'session.md.title',
  date: 'session.md.date',
  pair: 'session.md.pair',
  duration: 'session.md.duration',
  cost: 'session.md.cost',
  costUnknown: 'overlay.cost.unknown',
  transcript: 'session.md.transcript',
  summary: 'session.md.summary',
  glossary: 'session.md.glossary',
};
const JSON_MIME = 'application/json';
const SUBTITLE_MIME: Readonly<Record<SubtitleFormat, string>> = {
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `neboki-live-YYYY-MM-DD-HHmm.md` (or the given extension), in local time */
export function sessionFilename(startedAt: number, extension = '.md'): string {
  const date = new Date(startedAt);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `neboki-live-${day}-${pad(date.getHours())}${pad(date.getMinutes())}${extension}`;
}

function markdownLabels(): MarkdownLabels {
  const t = (field: keyof MarkdownLabels): string => i18n.global.t(LABEL_KEYS[field]);
  return {
    title: t('title'),
    date: t('date'),
    pair: t('pair'),
    duration: t('duration'),
    cost: t('cost'),
    costUnknown: t('costUnknown'),
    transcript: t('transcript'),
    summary: t('summary'),
    glossary: t('glossary'),
  };
}

/** Downloads a session as Markdown, to read or paste. False when it failed (logged). */
export function downloadMarkdown(record: SessionSnapshot): boolean {
  if (record.startedAt === null) return false;
  const markdown = toMarkdown(record, markdownLabels(), unref(i18n.global.locale));
  return downloadText(sessionFilename(record.startedAt), markdown);
}

/** Downloads a session as subtitles for a recording of the call. False when it failed (logged). */
export function downloadSubtitles(record: SessionSnapshot, format: SubtitleFormat): boolean {
  if (record.startedAt === null) return false;
  const name = sessionFilename(record.startedAt, `.${format}`);
  return downloadText(name, toSubtitles(record, format), SUBTITLE_MIME[format]);
}

/** Downloads a session as a file the app can open again. False when it failed (logged). */
export function downloadSessionFile(record: SessionSnapshot): boolean {
  if (record.startedAt === null) return false;
  const name = sessionFilename(record.startedAt, SESSION_FILE_EXTENSION);
  return downloadText(name, toSessionFile(record), JSON_MIME);
}

/**
 * Downloads the current session as Markdown. Works outside components (shortcuts) since
 * it uses the global i18n instance. Returns false when there is nothing to export or the
 * download failed (already logged).
 */
export function exportSession(): boolean {
  return downloadMarkdown(useSessionRecord());
}

export function useExportSession(): ExportSessionState {
  const record = useSessionRecord();
  const canExport = computed(() => record.startedAt !== null);
  return { canExport, exportSession };
}
