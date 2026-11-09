// Languages the captions can be translated into. Any language the model knows would
// do; these are the ones offered, by ISO 639-1 code, and named with Intl.DisplayNames.

export const TARGET_LANGUAGES = [
  'es',
  'en',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'ca',
  'eu',
  'gl',
  'pl',
  'ro',
  'sv',
  'ru',
  'uk',
  'tr',
  'ar',
  'hi',
  'zh',
  'ja',
  'ko',
] as const;

/** Not a language: the captions show what was said, without translating it */
export const ORIGINAL_LANGUAGE = 'original';

const FALLBACK_LANGUAGE = 'en';

export function isTargetLanguage(code: unknown): code is string {
  return typeof code === 'string' && (TARGET_LANGUAGES as readonly string[]).includes(code);
}

/** A remembered choice: a language, or no translation at all. */
export function isLanguageChoice(code: unknown): code is string {
  return code === ORIGINAL_LANGUAGE || isTargetLanguage(code);
}

/** The browser's first language that is offered, so most people never have to pick one. */
export function defaultTargetLanguage(languages: readonly string[] = navigator.languages): string {
  return (
    languages.map((tag) => tag.slice(0, 2).toLowerCase()).find(isTargetLanguage) ??
    FALLBACK_LANGUAGE
  );
}

/** "ja" → "Japonés" in the UI language; the code itself if the browser can't name it. */
export function languageLabel(code: string, uiLocale: string): string {
  try {
    const name = new Intl.DisplayNames([uiLocale], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(uiLocale) + name.slice(1);
  } catch {
    return code;
  }
}
