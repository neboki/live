// Turns an image a person picks into a small data: URL the brand can keep in
// localStorage: bitmaps are scaled down to fit LOGO_MAX_SIDE, SVGs are kept as drawn.

import { logError } from '@/shared/errors';
import { MAX_LOGO_CHARS } from './brand';

/** What the file picker offers */
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
const BITMAP_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SVG_TYPE = 'image/svg+xml';
/** A file larger than this is surely not a logo */
export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;
/** The logo shows at 24 px high; this leaves room for sharp screens and wide logos */
export const LOGO_MAX_SIDE = 256;

/** Why a file could not be used; each maps to a message for the user */
export type LogoError = 'type' | 'tooLarge' | 'unreadable';
export type LogoResult = { ok: true; dataUrl: string } | { ok: false; error: LogoError };

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (): void => resolve(String(reader.result));
    reader.onerror = (): void => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void => reject(new Error('The image could not be decoded'));
    img.src = url;
  });
}

/** Draws the bitmap no larger than LOGO_MAX_SIDE, as PNG (keeps transparency) */
async function shrinkBitmap(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    return png.length <= MAX_LOGO_CHARS ? png : canvas.toDataURL('image/webp', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Checks the file and returns it as a small data: URL, or why it cannot be used. */
export async function readLogoFile(file: File): Promise<LogoResult> {
  const isSvg = file.type === SVG_TYPE;
  if (!isSvg && !BITMAP_TYPES.has(file.type)) return { ok: false, error: 'type' };
  if (file.size > MAX_LOGO_FILE_BYTES) return { ok: false, error: 'tooLarge' };
  try {
    const dataUrl = isSvg ? await readAsDataUrl(file) : await shrinkBitmap(file);
    return dataUrl.length <= MAX_LOGO_CHARS
      ? { ok: true, dataUrl }
      : { ok: false, error: 'tooLarge' };
  } catch (err) {
    logError('Reading a logo file failed', err);
    return { ok: false, error: 'unreadable' };
  }
}
