import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { detectLocale, i18n, setLocale, syncDocumentLang } from './index';
import en from './locales/en.json';
import es from './locales/es.json';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('detectLocale', () => {
  it('picks the first supported language', () => {
    expect(detectLocale(['fr-FR', 'es-ES', 'en-US'])).toBe('es');
  });

  it('falls back to English', () => {
    expect(detectLocale(['ja-JP'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});

describe('locales', () => {
  it('keep the same keys in English and Spanish', () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });
});

describe('syncDocumentLang', () => {
  it('sets <html lang> and follows locale changes until stopped', async () => {
    const root = document.createElement('html');
    const initial = i18n.global.locale.value;
    const other = initial === 'en' ? 'es' : 'en';
    const stop = syncDocumentLang(root);

    expect(root.lang).toBe(initial);

    i18n.global.locale.value = other;
    await nextTick();
    expect(root.lang).toBe(other);

    stop();
    i18n.global.locale.value = initial;
    await nextTick();
    expect(root.lang).toBe(other);
  });
});

describe('setLocale', () => {
  it('switches the language and remembers the choice', () => {
    const initial = i18n.global.locale.value;

    setLocale('es');

    expect(i18n.global.locale.value).toBe('es');
    expect(localStorage.getItem('neboki-live:locale')).toBe('es');
    setLocale(initial);
    localStorage.clear();
  });
});
