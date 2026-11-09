// Types shared by the overlay components and store. Values live in ./constants.

import type { PipSize } from '@/shared/pip/useDocumentPip';
import type { ListeningMode, ReplySuggestion } from '@/shared/providers/types';

export type { ListeningMode };

export type OverlayOption = 'source' | 'voice' | 'suggestions' | 'summary' | 'speakers';

/** Where the captions show: in the live page, or in the always-on-top floating window */
export type CaptionPlacement = 'page' | 'floating';

/** Something is on its way to the captions: someone speaking, or a sentence being worked on */
export type CaptionActivity = 'hearing' | 'translating';

/** Colour scheme of the bar: each one is a dark glass tinted by two glows */
export type OverlayTheme = 'aurora' | 'sunset' | 'ocean' | 'forest' | 'graphite';

/** A reply (in a talk, a question) the user could give: `mine` in their language, `theirs` in the speaker's */
export type Suggestion = ReplySuggestion;

export interface Translation {
  /** Increments for every new sentence, so the UI can animate it */
  id: number;
  text: string;
  /** True once the sentence is complete (streaming finished) */
  done: boolean;
  /** Who said it (0, 1, …), when speakers are told apart */
  speaker?: number | null;
}

/** An earlier sentence, as the captions keep it */
export interface HistoryLine {
  /** Id the sentence had while it was the current one; stable for keyed rendering */
  id: number;
  text: string;
  speaker: number | null;
}

export interface LanguagePair {
  from: string;
  to: string;
}

/** An inclusive range for a numeric preference */
export interface NumberRange {
  min: number;
  max: number;
  step: number;
}

/** Size the user dragged the bar to; null keeps the default */
export interface BarSize {
  width: number | null;
  /** Height of the caption area: a taller one shows more of the earlier sentences */
  height: number | null;
}

/** Preferences remembered between visits (never the conversation itself) */
export interface OverlayPrefs {
  options: Record<OverlayOption, boolean>;
  /** A conversation the user takes part in, or a talk or video they follow */
  mode: ListeningMode;
  glossary: string;
  /** Text size, as a factor of the default */
  scale: number;
  /** Opacity of the bar's background; the text always stays fully opaque */
  opacity: number;
  theme: OverlayTheme;
  /** Loudness of the translated voice, 0..1 */
  voiceVolume: number;
  /** Loudness of the shared tab's original audio when it is heard, 0..1 */
  originalLevel: number;
  size: BarSize;
  /** Last size of the floating (Picture-in-Picture) window */
  pipSize: PipSize | null;
  /** Show the shared tab in the page, behind time, in step with the captions */
  syncVideo: boolean;
  /** Seconds the synced tab is held behind real time: one of SYNC_DELAY_CHOICES */
  syncDelay: number;
  /** Where the captions go when a session starts; the user can move them meanwhile */
  placement: CaptionPlacement;
}
