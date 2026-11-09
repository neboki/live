// The live screen on a phone can take the whole display: the app's top bar goes away and,
// where the browser allows it (Android, not iPhone Safari), the system bars too. Without
// the Fullscreen API the app still hides its own bar, which is most of the gain.

import { readonly, ref, type Ref } from 'vue';
import { logError } from '@/shared/errors';

const on = ref(false);
let listening = false;

function canFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

// Leaving fullscreen with the back gesture or Esc leaves immersive too
function listen(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) on.value = false;
  });
}

/** True while the live screen fills the display */
export const immersive: Readonly<Ref<boolean>> = readonly(on);

export function enterImmersive(): void {
  on.value = true;
  if (!canFullscreen() || document.fullscreenElement) return;
  listen();
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .catch((err: unknown) => logError('Could not enter fullscreen', err));
}

export function exitImmersive(): void {
  on.value = false;
  if (typeof document === 'undefined' || !document.fullscreenElement) return;
  document.exitFullscreen().catch((err: unknown) => logError('Could not leave fullscreen', err));
}

export function toggleImmersive(): void {
  if (on.value) exitImmersive();
  else enterImmersive();
}
