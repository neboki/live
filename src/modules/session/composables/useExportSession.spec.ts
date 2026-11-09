import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionRecord } from '../store/useSessionRecord';
import { exportSession, sessionFilename, useExportSession } from './useExportSession';

const downloadText = vi.hoisted(() => vi.fn<(name: string, text: string) => boolean>(() => true));
vi.mock('../utils/download', () => ({ downloadText }));

describe('useExportSession', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    downloadText.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('names the file after the local start time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 9, 7, 42));

    expect(sessionFilename(Date.now())).toBe('neboki-live-2026-01-05-0907.md');
    expect(sessionFilename(new Date(2026, 11, 31, 23, 59).getTime())).toBe(
      'neboki-live-2026-12-31-2359.md',
    );
  });

  it('does nothing before a session has begun', () => {
    const { canExport } = useExportSession();

    expect(canExport.value).toBe(false);
    expect(exportSession()).toBe(false);
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('downloads the current session as Markdown', () => {
    const record = useSessionRecord();
    const startedAt = new Date(2026, 9, 20, 14, 30).getTime();
    record.begin({ pair: { from: 'EN', to: 'ES' }, startedAt });
    record.addLine({ at: startedAt + 1_000, source: 'Heard line', translation: 'Línea traducida' });
    const { canExport } = useExportSession();

    expect(canExport.value).toBe(true);
    expect(exportSession()).toBe(true);

    const [name, text] = downloadText.mock.calls[0] ?? [];
    expect(name).toBe('neboki-live-2026-10-20-1430.md');
    expect(text).toContain('Heard line / Línea traducida');
  });
});
