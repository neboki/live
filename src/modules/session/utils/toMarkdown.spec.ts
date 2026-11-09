import { describe, expect, it } from 'vitest';
import type { MarkdownLabels, SessionSnapshot } from '../types';
import { escapeMarkdown, toMarkdown } from './toMarkdown';

const LABELS: MarkdownLabels = {
  title: 'Neboki Live session',
  date: 'Date',
  pair: 'Languages',
  duration: 'Duration',
  cost: 'Estimated cost',
  costUnknown: 'not available',
  transcript: 'Transcript',
  summary: 'Summary',
  glossary: 'Glossary',
};

const START = new Date(2026, 9, 20, 14, 30, 0).getTime();

function session(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    startedAt: START,
    endedAt: START + 3_725_000,
    pair: { from: 'EN', to: 'ES' },
    lines: [
      { at: START + 5_000, source: 'Hello everyone.', translation: 'Hola a todos.' },
      { at: START + 12_000, source: 'Q3 numbers are up.', language: 'en', translation: 'Suben.' },
    ],
    summary: ['Numbers went up'],
    glossary: 'Acme\n\nNeboki Live',
    usage: [],
    ...overrides,
  };
}

describe('toMarkdown', () => {
  it('renders the header, summary, glossary and transcript', () => {
    const date = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeStyle: 'short' }).format(
      START,
    );
    expect(toMarkdown(session(), LABELS, 'en')).toBe(
      [
        '# Neboki Live session',
        '',
        `- **Date:** ${date}`,
        '- **Languages:** EN → ES',
        '- **Duration:** 01:02:05',
        '- **Estimated cost:** ≈ €0.00',
        '',
        '## Summary',
        '',
        '- Numbers went up',
        '',
        '## Glossary',
        '',
        '- Acme',
        '- Neboki Live',
        '',
        '## Transcript',
        '',
        '- 14:30:05 — Hello everyone. / Hola a todos.',
        '- 14:30:12 — Q3 numbers are up. / Suben.',
        '',
      ].join('\n'),
    );
  });

  it('matches the snapshot', () => {
    const markdown = toMarkdown(session(), LABELS, 'en');
    expect(markdown.split('\n').slice(3)).toMatchSnapshot();
  });

  it('escapes Markdown in user and model text', () => {
    const markdown = toMarkdown(
      session({
        lines: [
          {
            at: START,
            source: '# *bold* [link](x) <b>|`code`\\_',
            translation: 'line one\nline two',
          },
        ],
        summary: ['**not bold**'],
        glossary: '<script>',
      }),
      LABELS,
      'en',
    );

    expect(markdown).toContain(
      '- 14:30:00 — \\# \\*bold\\* \\[link\\](x) \\<b\\>\\|\\`code\\`\\\\\\_ / line one line two',
    );
    expect(markdown).toContain('- \\*\\*not bold\\*\\*');
    expect(markdown).toContain('- \\<script\\>');
    expect(markdown).not.toContain('<script>');
  });

  it('escapes every special character', () => {
    expect(escapeMarkdown('\\`*_[]#<>|')).toBe('\\\\\\`\\*\\_\\[\\]\\#\\<\\>\\|');
  });

  it('renders an empty session', () => {
    const markdown = toMarkdown(
      {
        startedAt: null,
        endedAt: null,
        pair: { from: '', to: '' },
        lines: [],
        summary: [],
        glossary: '',
        usage: [],
      },
      LABELS,
      'en',
    );

    expect(markdown).toContain('- **Date:** —');
    expect(markdown).toContain('- **Languages:** AUTO → —');
    expect(markdown).toContain('- **Duration:** 00:00:00');
    expect(markdown).not.toContain('## Summary');
    expect(markdown).not.toContain('## Glossary');
    expect(markdown).toContain('## Transcript\n\n—\n');
  });

  it('shows the cost in euros, formatted for the locale', () => {
    const markdown = toMarkdown(
      session({
        usage: [{ model: 'gpt-6-luna', inputTokens: 10e6, cachedInputTokens: 0, outputTokens: 0 }],
      }),
      LABELS,
      'es',
    );
    // 10M tokens at $0.10 per million: $1, shown in euros
    expect(markdown).toMatch(/Estimated cost:\*\* ≈ 0,86\s€/);
  });
});
