import { beforeEach, describe, expect, it } from 'vitest';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import {
  BACKUP_KIND,
  backupFilename,
  createBackup,
  parseBackup,
  resetPreferences,
  restoreBackup,
} from './settingsBackup';

describe('settingsBackup', () => {
  beforeEach(() => window.localStorage.clear());

  it('copies the preferences but never the API key or the microphone', () => {
    writeStorage('theme', 'dark');
    writeStorage('target-language', 'ja');
    writeStorage('openai-key', 'secret-key');
    writeStorage('remember-key', 'false');
    writeStorage('mic-device', 'abc');

    const backup = createBackup(new Date('2026-11-05T10:00:00Z'));

    expect(backup.kind).toBe(BACKUP_KIND);
    expect(backup.values).toEqual({ theme: 'dark', 'target-language': 'ja' });
    expect(JSON.stringify(backup)).not.toContain('secret-key');
  });

  it('names the file after the day', () => {
    expect(backupFilename(new Date('2026-11-05T10:00:00Z'))).toBe(
      'neboki-live-settings-2026-11-05.json',
    );
  });

  it('restores a backup: its values in, the rest back to defaults, the key untouched', () => {
    writeStorage('theme', 'light');
    writeStorage('spend-limit', '5');
    writeStorage('openai-key', 'my-key');
    const text = JSON.stringify({
      kind: BACKUP_KIND,
      version: 1,
      values: { theme: 'dark', 'openai-key': 'their-key', unknown: 'x' },
    });

    expect(restoreBackup(text)).toEqual({ ok: true, count: 1 });
    expect(readStorage('theme')).toBe('dark');
    expect(readStorage('spend-limit')).toBeNull();
    expect(readStorage('openai-key')).toBe('my-key');
    expect(readStorage('unknown')).toBeNull();
  });

  it.each([
    ['not json', 'unreadable'],
    ['{"kind":"other","version":1,"values":{}}', 'notOurs'],
    [`{"kind":"${BACKUP_KIND}","version":99,"values":{"theme":"dark"}}`, 'newer'],
    [`{"kind":"${BACKUP_KIND}","version":1,"values":[]}`, 'notOurs'],
    [`{"kind":"${BACKUP_KIND}","version":1,"values":{"theme":3}}`, 'empty'],
    ['x'.repeat(300 * 1024), 'tooLarge'],
  ])('turns away %s', (text, error) => {
    writeStorage('theme', 'light');
    expect(parseBackup(text)).toEqual({ ok: false, error });
    expect(restoreBackup(text).ok).toBe(false);
    expect(readStorage('theme')).toBe('light');
  });

  it('resets the preferences and keeps the key', () => {
    writeStorage('theme', 'dark');
    writeStorage('openai-key', 'my-key');
    resetPreferences();
    expect(readStorage('theme')).toBeNull();
    expect(readStorage('openai-key')).toBe('my-key');
  });
});
