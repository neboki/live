// Reading the remembered preferences. Anything missing, malformed or out of range
// falls back to the default, so an old or hand-edited value can't break the bar.

import type { PipSize } from '@/shared/pip/useDocumentPip';
import { readStorage } from '@/shared/storage/safeStorage';
import {
  BAR_HEIGHT,
  BAR_WIDTH,
  CAPTION_PLACEMENTS,
  DEFAULT_PREFS,
  LISTENING_MODES,
  OPACITY_RANGE,
  OVERLAY_OPTIONS,
  OVERLAY_THEMES,
  PREFS_STORAGE_KEY,
  SCALE_RANGE,
  SYNC_DELAY_CHOICES,
  VOICE_VOLUME_RANGE,
  VOLUME_RANGE,
} from '../constants';
import type { BarSize, NumberRange, OverlayPrefs } from '../types';
import { clampTo } from '../utils/range';

/** The floating window can't be smaller than this */
const MIN_PIP = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(range: Readonly<NumberRange>, value: unknown, fallback: number): number {
  return isNumber(value) ? clampTo(range, value) : fallback;
}

function sizeOrNull(range: Readonly<NumberRange>, value: unknown): number | null {
  return isNumber(value) ? Math.round(clampTo(range, value)) : null;
}

function readSize(value: unknown): BarSize {
  if (!isRecord(value)) return { ...DEFAULT_PREFS.size };
  return {
    width: sizeOrNull(BAR_WIDTH, value.width),
    height: sizeOrNull(BAR_HEIGHT, value.height),
  };
}

function readPipSize(value: unknown): PipSize | null {
  if (!isRecord(value) || !isNumber(value.width) || !isNumber(value.height)) return null;
  if (value.width < MIN_PIP || value.height < MIN_PIP) return null;
  return { width: Math.round(value.width), height: Math.round(value.height) };
}

/** Remembered preferences; anything missing or malformed falls back to the default. */
export function loadPrefs(): OverlayPrefs {
  const prefs: OverlayPrefs = {
    ...DEFAULT_PREFS,
    options: { ...DEFAULT_PREFS.options },
    size: { ...DEFAULT_PREFS.size },
  };
  const raw = readStorage(PREFS_STORAGE_KEY);
  if (!raw) return prefs;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return prefs;
    const options = isRecord(parsed.options) ? parsed.options : {};
    for (const option of OVERLAY_OPTIONS) {
      const value = options[option];
      if (typeof value === 'boolean') prefs.options[option] = value;
    }
    prefs.mode = LISTENING_MODES.find((mode) => mode === parsed.mode) ?? prefs.mode;
    if (typeof parsed.glossary === 'string') prefs.glossary = parsed.glossary;
    prefs.scale = inRange(SCALE_RANGE, parsed.scale, prefs.scale);
    prefs.opacity = inRange(OPACITY_RANGE, parsed.opacity, prefs.opacity);
    prefs.voiceVolume = inRange(VOICE_VOLUME_RANGE, parsed.voiceVolume, prefs.voiceVolume);
    prefs.originalLevel = inRange(VOLUME_RANGE, parsed.originalLevel, prefs.originalLevel);
    prefs.theme = OVERLAY_THEMES.find((theme) => theme === parsed.theme) ?? prefs.theme;
    prefs.size = readSize(parsed.size);
    prefs.pipSize = readPipSize(parsed.pipSize);
    if (typeof parsed.syncVideo === 'boolean') prefs.syncVideo = parsed.syncVideo;
    prefs.syncDelay =
      SYNC_DELAY_CHOICES.find((seconds) => seconds === parsed.syncDelay) ?? prefs.syncDelay;
    if (typeof parsed.syncWait === 'boolean') prefs.syncWait = parsed.syncWait;
    prefs.placement =
      CAPTION_PLACEMENTS.find((placement) => placement === parsed.placement) ?? prefs.placement;
  } catch (err) {
    console.warn(`[Neboki Live] Ignoring unreadable "${PREFS_STORAGE_KEY}"`, err);
  }
  return prefs;
}
