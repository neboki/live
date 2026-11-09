// Installing the app to the home screen. Chrome on Android offers its own prompt, which
// fires early and only once, so it is caught from startup and kept for the button;
// Safari on iPhone has no prompt at all, so there the hint explains the Share menu.

import { ref } from 'vue';
import { logError } from '@/shared/errors';

/** Chrome's install prompt; not in the DOM typings */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallWay = 'prompt' | 'ios' | null;

const deferred = ref<InstallPromptEvent | null>(null);
const installed = ref(false);

/** Called once at startup, before the browser fires its prompt. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep it for our own button instead of the browser's mini bar
    event.preventDefault();
    deferred.value = event as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred.value = null;
    installed.value = true;
  });
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function isIos(): boolean {
  // iPadOS reports itself as a Mac; the touch points give it away
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isTouch(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches === true;
}

/** How this device can install the app, if it can and has not yet. Phones only. Reactive
 * inside a computed: the hint shows as soon as the prompt arrives. */
export function installWay(): InstallWay {
  if (installed.value || isStandalone() || !isTouch()) return null;
  if (deferred.value) return 'prompt';
  return isIos() ? 'ios' : null;
}

/** Shows the browser's install prompt; true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred.value;
  if (!event) return false;
  // The prompt can be shown only once
  deferred.value = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch (err) {
    logError('The install prompt failed', err);
    return false;
  }
}
