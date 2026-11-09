import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function setMedia(matches: Record<string, boolean>): void {
  window.matchMedia = vi.fn((query: string) => ({ matches: matches[query] ?? false })) as never;
}

function setUserAgent(ua: string): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0';

function firePrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): Event {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(() => Promise.resolve()),
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(event);
  return event;
}

describe('installPrompt', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.restoreAllMocks());

  it('explains the Share menu on an iPhone browser tab', async () => {
    setMedia({ '(pointer: coarse)': true });
    setUserAgent(IPHONE);
    const { installWay } = await import('./installPrompt');
    expect(installWay()).toBe('ios');
  });

  it('offers nothing once opened from the home screen, nor on a desktop', async () => {
    setUserAgent(IPHONE);
    setMedia({ '(pointer: coarse)': true, '(display-mode: standalone)': true });
    const { installWay } = await import('./installPrompt');
    expect(installWay()).toBeNull();
    setMedia({});
    expect(installWay()).toBeNull();
  });

  it('keeps Chrome’s prompt for the button and uses it once', async () => {
    setMedia({ '(pointer: coarse)': true });
    setUserAgent(ANDROID);
    const { installWay, listenForInstallPrompt, promptInstall } = await import('./installPrompt');
    listenForInstallPrompt();
    expect(installWay()).toBeNull();

    const event = firePrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(installWay()).toBe('prompt');
    await expect(promptInstall()).resolves.toBe(true);
    expect(installWay()).toBeNull();
    await expect(promptInstall()).resolves.toBe(false);
  });
});
