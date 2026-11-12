import type { MarkdownLabels, SessionSnapshot } from '../types';
import { costUsd, hasUnpricedUsage } from './costUsd';
import { formatEur } from './formatCost';

const MARKDOWN_SPECIAL = /[\\`*_[\]#<>|]/g;
const EMPTY = '—';

/** Escapes Markdown syntax and folds newlines so user and model text stays literal. */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(MARKDOWN_SPECIAL, '\\$&')
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local time of day as HH:MM:SS */
export function clock(epochMs: number): string {
  const date = new Date(epochMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Elapsed time as HH:MM:SS */
export function elapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** How long the session lasted: to its end, or to its last line if it never ended */
export function sessionDuration(record: SessionSnapshot): number {
  if (record.startedAt === null) return 0;
  const lastLine = record.lines.at(-1)?.at ?? record.startedAt;
  return (record.endedAt ?? lastLine) - record.startedAt;
}

function header(record: SessionSnapshot, labels: MarkdownLabels, locale: string): string[] {
  const date =
    record.startedAt === null
      ? EMPTY
      : new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(
          record.startedAt,
        );
  const from = escapeMarkdown(record.pair.from) || 'AUTO';
  const to = escapeMarkdown(record.pair.to) || EMPTY;
  const cost = hasUnpricedUsage(record.usage)
    ? labels.costUnknown
    : formatEur(costUsd(record.usage), locale);

  return [
    `# ${escapeMarkdown(record.title || labels.title)}`,
    '',
    `- **${escapeMarkdown(labels.date)}:** ${date}`,
    `- **${escapeMarkdown(labels.pair)}:** ${from} → ${to}`,
    `- **${escapeMarkdown(labels.duration)}:** ${elapsed(sessionDuration(record))}`,
    `- **${escapeMarkdown(labels.cost)}:** ≈ ${cost}`,
  ];
}

function listSection(title: string, items: readonly string[]): string[] {
  const entries = items.map(escapeMarkdown).filter((item) => item.length > 0);
  if (entries.length === 0) return [];
  return ['', `## ${escapeMarkdown(title)}`, '', ...entries.map((item) => `- ${item}`)];
}

/** Renders the current session as a Markdown document. */
export function toMarkdown(
  record: SessionSnapshot,
  labels: MarkdownLabels,
  locale: string,
): string {
  const transcript = record.lines.map(
    (line) =>
      `- ${clock(line.at)} — ${escapeMarkdown(line.source)}${line.translation ? ` / ${escapeMarkdown(line.translation)}` : ''}`,
  );

  return [
    ...header(record, labels, locale),
    ...listSection(labels.summary, record.summary),
    ...listSection(labels.glossary, record.glossary.split('\n')),
    '',
    `## ${escapeMarkdown(labels.transcript)}`,
    '',
    ...(transcript.length > 0 ? transcript : [EMPTY]),
    '',
  ].join('\n');
}
