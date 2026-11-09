import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logError, ValidationError } from '@/shared/errors';
import type { SessionSnapshot } from '../types';
import { cloneSnapshot, MAX_SESSION_FILE_BYTES, parseSessionFile } from '../utils/sessionFile';
import { useSessionRecord } from './useSessionRecord';

/** Where the conversation on screen came from */
export type ViewerSource = 'recent' | 'file';

/**
 * The conversation shown in the session page: the one that just ended, or one opened from
 * a saved file. Closing it goes back home; the record of the current session is untouched.
 */
export const useSessionViewer = defineStore('session-viewer', () => {
  const record = useSessionRecord();
  const snapshot = ref<SessionSnapshot | null>(null);
  const source = ref<ViewerSource>('recent');
  const fileName = ref<string | null>(null);
  /** i18n key of why the last file could not be opened */
  const errorKey = ref<string | null>(null);
  const opening = ref(false);

  /** Shows the session that just ended. False when there is none. */
  function showRecent(): boolean {
    if (record.startedAt === null) return false;
    snapshot.value = cloneSnapshot(record);
    source.value = 'recent';
    fileName.value = null;
    errorKey.value = null;
    return true;
  }

  /** Opens a saved conversation. On failure it stays home and errorKey says why. */
  async function openFile(file: File): Promise<boolean> {
    opening.value = true;
    errorKey.value = null;
    try {
      if (file.size > MAX_SESSION_FILE_BYTES) {
        throw new ValidationError(`Session file too big: ${file.size} bytes`, 'errors.sessionFile');
      }
      snapshot.value = parseSessionFile(await file.text());
      source.value = 'file';
      fileName.value = file.name;
      return true;
    } catch (err) {
      errorKey.value = logError(`Could not open ${file.name}`, err).userMessageKey;
      return false;
    } finally {
      opening.value = false;
    }
  }

  function close(): void {
    snapshot.value = null;
    fileName.value = null;
  }

  function clearError(): void {
    errorKey.value = null;
  }

  return {
    snapshot,
    source,
    fileName,
    errorKey,
    opening,
    showRecent,
    openFile,
    close,
    clearError,
  };
});
