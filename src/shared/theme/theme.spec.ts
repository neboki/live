import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, loadTheme, setTheme, theme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('follows the system unless something was stored', () => {
    expect(loadTheme()).toBe('system');
    window.localStorage.setItem('neboki-live:theme', 'dark');
    expect(loadTheme()).toBe('dark');
    window.localStorage.setItem('neboki-live:theme', 'blue');
    expect(loadTheme()).toBe('system');
  });

  it('stamps a chosen scheme on the root and remembers it; system clears both', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('neboki-live:theme')).toBe('dark');
    expect(theme.value).toBe('dark');

    setTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem('neboki-live:theme')).toBeNull();
  });

  it('applies to any root, such as the floating window', () => {
    const root = document.createElement('html');
    applyTheme('light', root);
    expect(root.dataset.theme).toBe('light');
  });
});
