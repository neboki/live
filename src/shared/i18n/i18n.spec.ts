import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { detectLocale, i18n, setLocale, syncDocumentLang } from './index';
import en from './locales/en.json';
import enText from './locales/en.json?raw';
import es from './locales/es.json';
import esText from './locales/es.json?raw';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

/**
 * Keys written twice in the same object of a JSON text. JSON.parse keeps the last one in
 * silence, so the first text is lost without any error.
 */
function repeatedKeys(json: string): string[] {
  const repeated: string[] = [];
  const objects: Set<string>[] = [];
  const token = /"(?:[^"\\]|\\.)*"(\s*:)?|[{}]/g;
  for (const match of json.matchAll(token)) {
    const text = match[0];
    if (text === '{') objects.push(new Set());
    else if (text === '}') objects.pop();
    else if (match[1]) {
      const key = text.slice(0, text.lastIndexOf('"') + 1);
      const seen = objects.at(-1);
      if (seen?.has(key)) repeated.push(key);
      seen?.add(key);
    }
  }
  return repeated;
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

  it('never write the same key twice in one group, where the second would hide the first', () => {
    expect(repeatedKeys('{"a": {"x": "1", "x": "2"}, "b": {"x": "3"}}')).toEqual(['"x"']);
    expect(repeatedKeys(esText)).toEqual([]);
    expect(repeatedKeys(enText)).toEqual([]);
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
