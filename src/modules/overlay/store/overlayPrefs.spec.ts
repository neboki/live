import { beforeEach, describe, expect, it } from 'vitest';
import { writeStorage } from '@/shared/storage/safeStorage';
import { DEFAULT_PREFS, PREFS_STORAGE_KEY } from '../constants';
import { loadPrefs, storedPrefs, SYNC_VIDEO_KEY } from './overlayPrefs';

describe('the synced picture preference', () => {
  beforeEach(() => localStorage.clear());

  it('is off by default', () => {
    expect(loadPrefs().syncVideo).toBe(false);
  });

  it('ignores the old stored "syncVideo", which was on without being chosen', () => {
    writeStorage(PREFS_STORAGE_KEY, JSON.stringify({ syncVideo: true }));

    expect(loadPrefs().syncVideo).toBe(false);
  });

  it('keeps a choice stored under its new name', () => {
    const stored = storedPrefs({ ...DEFAULT_PREFS, syncVideo: true });
    writeStorage(PREFS_STORAGE_KEY, JSON.stringify(stored));

    expect(stored).not.toHaveProperty('syncVideo');
    expect(stored[SYNC_VIDEO_KEY]).toBe(true);
    expect(loadPrefs().syncVideo).toBe(true);
  });
});
