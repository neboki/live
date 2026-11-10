import type { PipSize } from '@/shared/pip/useDocumentPip';
import type {
  CaptionPlacement,
  ListeningMode,
  NumberRange,
  OverlayOption,
  OverlayPrefs,
  OverlayTheme,
} from './types';

export const OVERLAY_OPTIONS: readonly OverlayOption[] = [
  'source',
  'voice',
  'suggestions',
  'summary',
  'speakers',
];

export const OVERLAY_THEMES: readonly OverlayTheme[] = [
  'aurora',
  'sunset',
  'ocean',
  'forest',
  'graphite',
];

export const LISTENING_MODES: readonly ListeningMode[] = ['conversation', 'talk'];

/** The floating window first: it suits a shared tab, which the user keeps watching */
export const CAPTION_PLACEMENTS: readonly CaptionPlacement[] = ['floating', 'page'];

/** safeStorage key for the remembered preferences */
export const PREFS_STORAGE_KEY = 'overlay-prefs';

export const SCALE_RANGE: Readonly<NumberRange> = { min: 0.8, max: 1.8, step: 0.1 };
export const OPACITY_RANGE: Readonly<NumberRange> = { min: 0.3, max: 1, step: 0.01 };
export const VOLUME_RANGE: Readonly<NumberRange> = { min: 0, max: 1, step: 0.05 };
/** The translated voice can be boosted: synthetic voices are quiet at 100% */
export const VOICE_VOLUME_RANGE: Readonly<NumberRange> = { min: 0, max: 2, step: 0.05 };
/** Share of the spending limit at which the session warns, and the bar starts showing the cost */
export const NEAR_SPEND_LIMIT = 0.8;
/**
 * Seconds the synced tab can be held behind real time. Fixed for the whole session, like
 * a live broadcast: longer leaves more room for a slow translation to land on time
 */
export const SYNC_DELAY_CHOICES: readonly number[] = [3, 5, 8, 10, 15, 20, 30];

/** Limits for resizing the bar, in CSS pixels; `step` is what one arrow key press changes */
export const BAR_WIDTH: Readonly<NumberRange> = { min: 380, max: 1400, step: 24 };
export const BAR_HEIGHT: Readonly<NumberRange> = { min: 64, max: 720, step: 24 };

/** Floating window size the first time it opens */
export const DEFAULT_PIP_SIZE: Readonly<PipSize> = { width: 640, height: 280 };

export const DEFAULT_PREFS: Readonly<OverlayPrefs> = {
  options: { source: false, voice: false, suggestions: false, summary: false, speakers: true },
  mode: 'conversation',
  glossary: '',
  scale: 1,
  opacity: 0.76,
  theme: 'sunset',
  voiceVolume: 1,
  originalLevel: 1,
  size: { width: null, height: null },
  pipSize: null,
  syncVideo: true,
  syncDelay: 10,
  syncWait: true,
  placement: 'floating',
};
