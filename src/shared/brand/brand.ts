// The brand the app wears: its name, logo and colours. Neboki Live is the product
// underneath (storage keys, file formats and logs keep that name); on top it can be
// dressed as another company's, without touching the code that does the work.
// global.scss reads the colours from data-brand on the root element; the
// floating window copies the attribute when it opens.
//
// A new brand is one entry in BRANDS, one block in styles/_brands.scss and, if it has
// one, its logo in public/brands/.

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { i18n, SUPPORTED_LOCALES } from '@/shared/i18n';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';

export type BrandId = 'neboki';

export interface Brand {
  readonly id: BrandId;
  /** The product name shown to people: title bar, sidebar, messages, exported files */
  readonly name: string;
  /** Logo under public/ (no leading slash); without one, the drawn mark is used */
  readonly logo?: string;
}

export const BRANDS: Readonly<Record<BrandId, Brand>> = {
  neboki: { id: 'neboki', name: 'Neboki Live' },
};

export const BRAND_IDS = Object.keys(BRANDS) as readonly BrandId[];
const STORAGE_BRAND = 'brand';

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

/** The current choice, for the UI to show */
export const brandId: Ref<BrandId> = ref(loadBrand());
export const brand: ComputedRef<Brand> = computed(() => BRANDS[brandId.value]);

/** Public URL of a brand's logo, with the app's base path */
export function logoUrl(target: Brand): string | null {
  return target.logo ? `${import.meta.env.BASE_URL}${target.logo}` : null;
}

/** Puts the brand's name where the messages read it (`@:brand.name`). */
function applyBrandName(name: string): void {
  for (const locale of SUPPORTED_LOCALES) {
    i18n.global.mergeLocaleMessage(locale, { brand: { name } });
  }
}

/** Stamps the brand on a document's root (colours) and its title. */
export function applyBrand(id: BrandId, root: HTMLElement = document.documentElement): void {
  root.dataset.brand = id;
  const doc = root.ownerDocument;
  if (doc === document) {
    doc.title = BRANDS[id].name;
    applyBrandName(BRANDS[id].name);
  }
}

/** Switches the brand, remembers it and applies it to the page. */
export function setBrand(id: BrandId): void {
  brandId.value = id;
  writeStorage(STORAGE_BRAND, id === DEFAULT_BRAND ? null : id);
  applyBrand(id);
}
