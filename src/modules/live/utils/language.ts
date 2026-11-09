import { ORIGINAL_LANGUAGE } from '@/modules/settings';

/** "es" → "Spanish": prompts name the target language in English. Null: no translation. */
export function languageName(locale: string): string | null {
  if (locale === ORIGINAL_LANGUAGE) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}
