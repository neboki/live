import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_PATH } from '@/shared/links';
import { useAppPage } from './useAppPage';

describe('useAppPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    setActivePinia(createPinia());
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('starts on no page of its own', () => {
    const page = useAppPage();
    expect(page.settingsOpen).toBe(false);
    expect(page.privacyOpen).toBe(false);
  });

  it('opens the privacy page when the address points at it', () => {
    window.history.replaceState(null, '', PRIVACY_PATH);
    expect(useAppPage().privacyOpen).toBe(true);
  });

  it('gives the privacy page its own address, and leaves it on close', async () => {
    const page = useAppPage();
    page.settingsOpen = true;

    page.openPrivacy();
    await nextTick();
    expect(page.settingsOpen).toBe(false);
    expect(window.location.pathname).toBe(PRIVACY_PATH);

    page.privacyOpen = false;
    await nextTick();
    expect(window.location.pathname).toBe('/');
  });

  it('follows the back button', () => {
    const page = useAppPage();
    window.history.replaceState(null, '', PRIVACY_PATH);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(page.privacyOpen).toBe(true);

    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(page.privacyOpen).toBe(false);
  });
});
