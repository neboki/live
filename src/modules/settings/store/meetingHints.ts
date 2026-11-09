// What the transcriber is told about the meeting: the languages people speak and the topic.

import { isTargetLanguage } from '../languages';

/** Both may be left empty */
export interface MeetingHints {
  /** ISO 639-1 codes of the languages people speak; empty: any */
  languages: string[];
  topic: string;
}

/** Languages a meeting may be set to expect */
export const MAX_MEETING_LANGUAGES = 4;

/** Stored hints, keeping only what is valid. */
export function parseMeeting(stored: Record<string, unknown>): MeetingHints {
  const languages = Array.isArray(stored.languages)
    ? stored.languages.filter(isTargetLanguage).slice(0, MAX_MEETING_LANGUAGES)
    : [];
  return { languages, topic: typeof stored.topic === 'string' ? stored.topic : '' };
}
