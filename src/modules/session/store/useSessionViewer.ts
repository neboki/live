import { defineStore } from 'pinia';
import { ref } from 'vue';
import { logError, ValidationError } from '@/shared/errors';
import type { SessionSnapshot, Usage } from '../types';
import {
  cleanTitle,
  cloneSnapshot,
  MAX_SESSION_FILE_BYTES,
  parseSessionFile,
} from '../utils/sessionFile';
import { mergeUsage, useSessionRecord } from './useSessionRecord';

/** Where the conversation on screen came from */
export type ViewerSource = 'recent' | 'file' | 'cloud';

/**
 * The conversation shown in the session page: the one that just ended, one opened from
 * a saved file, or one kept in the account. Closing it goes back home; the record of the
 * current session is untouched.
 */
export const useSessionViewer = defineStore('session-viewer', () => {
  const record = useSessionRecord();
  const snapshot = ref<SessionSnapshot | null>(null);
  const source = ref<ViewerSource>('recent');
  const fileName = ref<string | null>(null);
  /** i18n key of why the last file could not be opened */
  const errorKey = ref<string | null>(null);
  const opening = ref(false);
  /** Id in the account of the conversation on screen, when it came from there */
  const cloudId = ref<string | null>(null);

  /** Shows the session that just ended. False when there is none. */
  function showRecent(): boolean {
    if (record.startedAt === null) return false;
    snapshot.value = cloneSnapshot(record);
    source.value = 'recent';
    fileName.value = null;
    cloudId.value = null;
    errorKey.value = null;
    return true;
  }

  /** Shows a conversation read from the account */
  function showSaved(saved: SessionSnapshot, id: string): void {
    snapshot.value = cloneSnapshot(saved);
    source.value = 'cloud';
    fileName.value = null;
    cloudId.value = id;
    errorKey.value = null;
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
      cloudId.value = null;
      return true;
    } catch (err) {
      errorKey.value = logError(`Could not open ${file.name}`, err).userMessageKey;
      return false;
    } finally {
      opening.value = false;
    }
  }

  /** The conversation on screen is the one that just ended: its record changes with it */
  function isRecord(shown: SessionSnapshot): boolean {
    return source.value === 'recent' && record.startedAt === shown.startedAt;
  }

  /** Names the conversation on screen; an empty name leaves it without one */
  function setTitle(name: string): void {
    const shown = snapshot.value;
    if (!shown) return;
    const title = cleanTitle(name);
    const named: SessionSnapshot = { ...shown, title };
    if (!title) delete named.title;
    snapshot.value = named;
    if (isRecord(shown)) record.setTitle(title);
  }

  /** Gives the conversation on screen a summary written after it ended */
  function setSummary(points: readonly string[]): void {
    const shown = snapshot.value;
    if (!shown) return;
    snapshot.value = { ...shown, summary: [...points] };
    if (isRecord(shown)) record.setSummary(points);
  }

  /** Adds to the conversation on screen what something done from its page spent */
  function addUsage(spent: readonly Usage[]): void {
    const shown = snapshot.value;
    if (!shown || spent.length === 0) return;
    const usage = shown.usage.map((entry) => ({ ...entry }));
    for (const entry of spent) {
      const index = usage.findIndex((item) => item.model === entry.model);
      const current = usage[index];
      if (current) usage[index] = mergeUsage(current, entry);
      else usage.push({ ...entry });
      if (isRecord(shown)) record.addUsage(entry);
    }
    snapshot.value = { ...shown, usage };
  }

  function close(): void {
    snapshot.value = null;
    fileName.value = null;
    cloudId.value = null;
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
    cloudId,
    showRecent,
    showSaved,
    openFile,
    setTitle,
    setSummary,
    addUsage,
    close,
    clearError,
  };
});
