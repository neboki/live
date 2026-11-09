import { logError } from '@/shared/errors';

/** Firefox and Safari read the blob after click() returns; revoking at once cancels it */
export const REVOKE_DELAY_MS = 40_000;

/**
 * Saves text as a file through a temporary `<a download>`. Returns false when the browser
 * refused it; the error is logged and never thrown.
 */
export function downloadText(filename: string, text: string, mime = 'text/markdown'): boolean {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;
  try {
    url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    return true;
  } catch (err) {
    logError(`Download of ${filename} failed`, err);
    return false;
  } finally {
    anchor?.remove();
    const done = url;
    if (done !== null) window.setTimeout(() => URL.revokeObjectURL(done), REVOKE_DELAY_MS);
  }
}
