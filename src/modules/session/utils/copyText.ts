import { logError } from '@/shared/errors';

/** Copies text to the clipboard. False when the browser refused (logged). Never throws. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    logError('Copying to the clipboard failed', err);
    return false;
  }
}
