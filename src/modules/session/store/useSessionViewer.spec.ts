import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toSessionFile } from '../utils/sessionFile';
import { useSessionRecord } from './useSessionRecord';
import { useSessionViewer } from './useSessionViewer';

const START = new Date(2026, 9, 20, 14, 30).getTime();

function sessionFile(name: string, content: string): File {
  return new File([content], name, { type: 'application/json' });
}

describe('useSessionViewer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows a copy of the session that just ended', () => {
    const record = useSessionRecord();
    const viewer = useSessionViewer();
    expect(viewer.showRecent()).toBe(false);

    record.begin({ pair: { from: 'AUTO', to: 'ES' }, startedAt: START });
    record.addLine({ at: START + 1, source: 'Hello', translation: 'Hola' });
    record.end();

    expect(viewer.showRecent()).toBe(true);
    expect(viewer.source).toBe('recent');
    expect(viewer.snapshot?.lines).toHaveLength(1);

    record.begin({ pair: { from: 'AUTO', to: 'EN' }, startedAt: START + 10 });
    expect(viewer.snapshot?.lines).toHaveLength(1);
  });

  it('names, summarises and charges the conversation that just ended, and its record', () => {
    const record = useSessionRecord();
    const viewer = useSessionViewer();
    record.begin({ pair: { from: 'AUTO', to: 'ES' }, startedAt: START });
    record.addLine({ at: START + 1, source: 'Hello', translation: 'Hola' });
    record.addUsage({ model: 'm', inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 });
    record.end();
    viewer.showRecent();

    viewer.setTitle('  Budget   review ');
    viewer.setSummary(['Closes on Friday']);
    viewer.addUsage([{ model: 'm', inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 }]);

    expect(viewer.snapshot).toMatchObject({
      title: 'Budget review',
      summary: ['Closes on Friday'],
      usage: [{ model: 'm', inputTokens: 11, outputTokens: 7 }],
    });
    expect(record.title).toBe('Budget review');
    expect(record.summary).toEqual(['Closes on Friday']);
    expect(record.usage).toMatchObject([{ inputTokens: 11, outputTokens: 7 }]);

    viewer.setTitle('   ');
    expect(viewer.snapshot).not.toHaveProperty('title');
    expect(record.title).toBe('');
  });

  it('leaves the record alone when the conversation on screen is another one', async () => {
    const record = useSessionRecord();
    const viewer = useSessionViewer();
    record.begin({ pair: { from: 'AUTO', to: 'ES' }, startedAt: START });
    const content = toSessionFile({
      startedAt: START,
      endedAt: START + 5,
      pair: { from: 'EN', to: 'ES' },
      lines: [],
      summary: [],
      glossary: '',
      usage: [],
    });
    await viewer.openFile(sessionFile('call.neboki-live.json', content));

    viewer.setTitle('From a file');

    expect(viewer.snapshot?.title).toBe('From a file');
    expect(record.title).toBe('');
  });

  it('opens a saved conversation', async () => {
    const viewer = useSessionViewer();
    const content = toSessionFile({
      startedAt: START,
      endedAt: START + 5,
      pair: { from: 'EN', to: 'ES' },
      lines: [{ at: START + 1, source: 'Hi', translation: 'Hola' }],
      summary: [],
      glossary: '',
      usage: [],
    });

    expect(await viewer.openFile(sessionFile('call.neboki-live.json', content))).toBe(true);
    expect(viewer.source).toBe('file');
    expect(viewer.fileName).toBe('call.neboki-live.json');
    expect(viewer.snapshot?.pair.from).toBe('EN');
    expect(viewer.opening).toBe(false);

    viewer.close();
    expect(viewer.snapshot).toBeNull();
  });

  it('stays home and says why when the file is not a conversation', async () => {
    const viewer = useSessionViewer();

    expect(await viewer.openFile(sessionFile('notes.json', '{"hello":1}'))).toBe(false);
    expect(viewer.snapshot).toBeNull();
    expect(viewer.errorKey).toBe('errors.sessionFile');
    expect(console.error).toHaveBeenCalled();
  });
});
