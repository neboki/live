// The brand the app wears: its name, logo and colours. Neboki Live is the product
// underneath (storage keys, file formats and logs keep that name); on top it can be
// dressed as another company's, without touching the code that does the work.
// global.scss reads the colours from data-brand on the root element; the
// floating window copies the attribute when it opens.
//
// A new brand is one entry in BRANDS, one block in styles/_brands.scss and, if it has
// one, its logo in public/brands/.
//
// On top of the chosen brand, a person can set their own name, logo and accent colour
// from the settings page (BrandCustom). That layer lives in this browser only.

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { i18n, SUPPORTED_LOCALES } from '@/shared/i18n';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { accentStylesheet, isHexColor } from './brandColors';

export type BrandId = 'neboki';

export interface Brand {
  readonly id: BrandId;
  /** The product name shown to people: title bar, sidebar, messages, exported files */
  readonly name: string;
  /** Logo under public/ (no leading slash) or a data: URL; without one, the drawn mark */
  readonly logo?: string;
  /** Accent colour (#rrggbb) laid over the brand's palette */
  readonly accent?: string;
}

/** What a person changed on top of the brand; each field is optional */
export interface BrandCustom {
  readonly name?: string;
  /** An image as a data: URL, made small by readLogoFile */
  readonly logo?: string;
  readonly accent?: string;
}

export const BRANDS: Readonly<Record<BrandId, Brand>> = {
  neboki: { id: 'neboki', name: 'Neboki Live' },
};

export const BRAND_IDS = Object.keys(BRANDS) as readonly BrandId[];
const STORAGE_BRAND = 'brand';
export const STORAGE_BRAND_CUSTOM = 'brand-custom';
export const MAX_BRAND_NAME = 40;
/** A stored logo larger than this is ignored (localStorage and backups stay small) */
export const MAX_LOGO_CHARS = 150_000;
const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/;
/** On the root while a custom accent applies; the custom stylesheet keys on it */
const ACCENT_ATTR = 'data-brand-accent';
const ACCENT_STYLE_ID = 'lg-brand-accent';

function isBrandId(value: unknown): value is BrandId {
  return (BRAND_IDS as readonly unknown[]).includes(value);
}

/** The brand a build starts with: VITE_DEFAULT_BRAND, or Neboki */
export const DEFAULT_BRAND: BrandId = isBrandId(import.meta.env.VITE_DEFAULT_BRAND)
  ? import.meta.env.VITE_DEFAULT_BRAND
  : 'neboki';

export function loadBrand(): BrandId {
  const stored = readStorage(STORAGE_BRAND);
  return isBrandId(stored) ? stored : DEFAULT_BRAND;
}

/** Keeps only the fields that are valid; anything else falls back to the brand's own */
export function sanitizeCustom(value: unknown): BrandCustom {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_BRAND_NAME) : undefined;
  const logo =
    typeof raw.logo === 'string' &&
    raw.logo.length <= MAX_LOGO_CHARS &&
    LOGO_DATA_URL.test(raw.logo)
      ? raw.logo
      : undefined;
  const accent = isHexColor(raw.accent) ? raw.accent.toLowerCase() : undefined;
  return {
    ...(name ? { name } : {}),
    ...(logo ? { logo } : {}),
    ...(accent ? { accent } : {}),
  };
}

export function loadBrandCustom(): BrandCustom {
  const stored = readStorage(STORAGE_BRAND_CUSTOM);
  if (!stored) return {};
  try {
    return sanitizeCustom(JSON.parse(stored));
  } catch (err) {
    console.warn('[Neboki Live] Ignoring an unreadable custom brand', err);
    return {};
  }
}

/** The current choice, for the UI to show */
export const brandId: Ref<BrandId> = ref(loadBrand());
export const brandCustom: Ref<BrandCustom> = ref(loadBrandCustom());

function resolveBrand(id: BrandId, custom: BrandCustom): Brand {
  return { ...BRANDS[id], ...custom };
}

export const brand: ComputedRef<Brand> = computed(() =>
  resolveBrand(brandId.value, brandCustom.value),
);

/** Public URL of a brand's logo, with the app's base path */
export function logoUrl(target: Brand): string | null {
  if (!target.logo) return null;
  return target.logo.startsWith('data:')
    ? target.logo
    : `${import.meta.env.BASE_URL}${target.logo}`;
}

/** Puts the brand's name where the messages read it (`@:brand.name`). */
function applyBrandName(name: string): void {
  for (const locale of SUPPORTED_LOCALES) {
    i18n.global.mergeLocaleMessage(locale, { brand: { name } });
  }
}

/** Lays the accent colour over the palette of one document, or takes it off. */
function applyAccent(accent: string | undefined, root: HTMLElement): void {
  const doc = root.ownerDocument;
  let style = doc.getElementById(ACCENT_STYLE_ID);
  if (!accent) {
    root.removeAttribute(ACCENT_ATTR);
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = ACCENT_STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = accentStylesheet(accent, ACCENT_ATTR);
  root.setAttribute(ACCENT_ATTR, '');
}

/** The page's own icon, kept to put back when the custom logo goes */
let defaultIcon: string | null = null;

/** Shows the custom logo as the tab's icon, or puts the original back. */
function applyIcon(logo: string | undefined, doc: Document): void {
  const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  defaultIcon ??= link.getAttribute('href');
  if (logo?.startsWith('data:')) {
    link.href = logo;
    link.removeAttribute('type');
  } else if (defaultIcon) {
    link.setAttribute('href', defaultIcon);
  }
}

/** Stamps the brand on a document's root (colours) and its title. */
export function applyBrand(id: BrandId, root: HTMLElement = document.documentElement): void {
  const target = resolveBrand(id, brandCustom.value);
  root.dataset.brand = id;
  applyAccent(target.accent, root);
  const doc = root.ownerDocument;
  if (doc === document) {
    doc.title = target.name;
    applyBrandName(target.name);
    applyIcon(brandCustom.value.logo, doc);
  }
}

/** Switches the brand, remembers it and applies it to the page. */
export function setBrand(id: BrandId): void {
  brandId.value = id;
  writeStorage(STORAGE_BRAND, id === DEFAULT_BRAND ? null : id);
  applyBrand(id);
}

/**
 * Changes the person's own name, logo or colour (an empty value puts the brand's own
 * back), remembers it and applies it to the page.
 */
export function updateBrandCustom(patch: Partial<Record<keyof BrandCustom, string | null>>): void {
  // An empty value becomes undefined, which sanitizeCustom drops
  const merged: Record<string, unknown> = { ...brandCustom.value };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = value === null || value === '' ? undefined : value;
  }
  setBrandCustom(merged);
}

/**
 * Replaces the whole custom layer (e.g. with the one kept in the account), keeping only
 * valid fields, remembers it and applies it to the page.
 */
export function setBrandCustom(value: unknown): void {
  const next = sanitizeCustom(value);
  brandCustom.value = next;
  writeStorage(STORAGE_BRAND_CUSTOM, Object.keys(next).length > 0 ? JSON.stringify(next) : null);
  applyBrand(brandId.value);
}

/** Drops every custom change: the brand's own name, logo and colours again. */
export function resetBrandCustom(): void {
  setBrandCustom({});
}
