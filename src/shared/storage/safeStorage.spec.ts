import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_PREFIX, readStorage, writeStorage } from './safeStorage';

describe('safeStorage', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('stores values under the neboki-live: prefix', () => {
    writeStorage('thing', 'value');

    expect(STORAGE_PREFIX).toBe('neboki-live:');
    expect(window.localStorage.getItem('neboki-live:thing')).toBe('value');
    expect(readStorage('thing')).toBe('value');
  });

  it('removes the entry when writing null', () => {
    writeStorage('thing', 'value');
    writeStorage('thing', null);

    expect(window.localStorage.getItem('neboki-live:thing')).toBeNull();
    expect(readStorage('thing')).toBeNull();
  });

  it('returns null and warns when storage throws on read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(readStorage('thing')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('thing'), expect.any(DOMException));
  });

  it('does not throw when storage throws on write or remove', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => writeStorage('thing', 'value')).not.toThrow();
    expect(() => writeStorage('thing', null)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
