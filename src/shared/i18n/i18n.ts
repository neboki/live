import { watch, type WatchStopHandle } from 'vue';
import { createI18n } from 'vue-i18n';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import en from './locales/en.json';
import es from './locales/es.json';

export type MessageSchema = typeof en;
export type Locale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'es'];
const FALLBACK_LOCALE: Locale = 'en';
const STORAGE_LOCALE = 'locale';

export function detectLocale(languages: readonly string[] = navigator.languages): Locale {
  const match = languages
    .map((tag) => tag.slice(0, 2).toLowerCase())
    .find((code): code is Locale => (SUPPORTED_LOCALES as readonly string[]).includes(code));
  return match ?? FALLBACK_LOCALE;
}

function isLocale(value: unknown): value is Locale {
  return (SUPPORTED_LOCALES as readonly unknown[]).includes(value);
}

/** The language the user picked by hand, which wins over the browser's */
function storedLocale(): Locale | null {
  const stored = readStorage(STORAGE_LOCALE);
  return isLocale(stored) ? stored : null;
}

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: storedLocale() ?? detectLocale(),
  fallbackLocale: FALLBACK_LOCALE,
  messages: { en, es },
});

/** Switches the language and remembers it. */
export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale;
  writeStorage(STORAGE_LOCALE, locale);
}

/** Keeps `<html lang>` in step with the active locale (screen readers, hyphenation, SEO). */
export function syncDocumentLang(root: HTMLElement = document.documentElement): WatchStopHandle {
  return watch(
    i18n.global.locale,
    (locale) => {
      root.lang = locale;
    },
    { immediate: true },
  );
}
