import { describe, expect, it } from 'vitest';
import {
  PARTNER_SPEAKER,
  readLanguageTag,
  routeOf,
  speakerOf,
  speakerOfTag,
  USER_SPEAKER,
} from './conversation';
import type { Partner } from './types';

const user = { code: 'es', language: 'Spanish' };

function partner(toUser = true, toPartner = true): Partner {
  return { code: 'en', language: 'English', toUser: () => toUser, toPartner: () => toPartner };
}

describe('speakerOf', () => {
  it('tells the user and the other person apart by language', () => {
    expect(speakerOf('es', user, partner())).toBe(USER_SPEAKER);
    expect(speakerOf('en-US', user, partner())).toBe(PARTNER_SPEAKER);
    expect(speakerOf('English', user, partner())).toBe(PARTNER_SPEAKER);
  });

  it('does not guess a third language or a missing one', () => {
    expect(speakerOf('fr', user, partner())).toBeNull();
    expect(speakerOf(undefined, user, partner())).toBeNull();
  });

  it('places a sentence by its words when the transcriber names no language', () => {
    expect(speakerOf(undefined, user, partner(), 'Where is the station?')).toBe(PARTNER_SPEAKER);
    expect(speakerOf(undefined, user, partner(), '¿Dónde está la estación?')).toBe(USER_SPEAKER);
  });

  it('trusts clear words over a transcriber that named the wrong one', () => {
    expect(speakerOf('en', user, partner(), 'Está a dos calles de aquí')).toBe(USER_SPEAKER);
  });

  it('falls back to the transcriber when the words could be either language', () => {
    expect(speakerOf('en', user, partner(), 'Taxi')).toBe(PARTNER_SPEAKER);
    expect(speakerOf(undefined, user, partner(), 'Taxi')).toBeNull();
  });
});

describe('speakerOfTag', () => {
  it('reads who spoke from the code the translator named', () => {
    expect(speakerOfTag('en', user, partner())).toBe(PARTNER_SPEAKER);
    expect(speakerOfTag('es', user, partner())).toBe(USER_SPEAKER);
    expect(speakerOfTag('fr', user, partner())).toBeNull();
    expect(speakerOfTag(null, user, partner())).toBeNull();
  });
});

describe('routeOf', () => {
  it("sends each person's words into the other's language", () => {
    expect(routeOf(USER_SPEAKER, 'Spanish', partner())).toBe('English');
    expect(routeOf(PARTNER_SPEAKER, 'Spanish', partner())).toBe('Spanish');
  });

  it('skips a direction the listener turned off', () => {
    expect(routeOf(USER_SPEAKER, 'Spanish', partner(true, false))).toBeNull();
    expect(routeOf(PARTNER_SPEAKER, 'Spanish', partner(false, true))).toBeNull();
  });

  it('lets the translator choose when the language is unknown, and name it', () => {
    const into = routeOf(null, 'Spanish', partner());
    expect(into).toContain('into English instead');
    expect(into).toContain("fragment's language code in square brackets");
  });
});

describe('readLanguageTag', () => {
  it('splits the code off the start of the translation', () => {
    expect(readLanguageTag('[en] Está cerca')).toEqual({ code: 'en', rest: 'Está cerca' });
    expect(readLanguageTag(' [ES]Hello')).toEqual({ code: 'es', rest: 'Hello' });
    expect(readLanguageTag('[pt-BR] Olá')).toEqual({ code: 'pt-br', rest: 'Olá' });
  });

  it('waits while the start could still be a tag', () => {
    expect(readLanguageTag('')).toBeUndefined();
    expect(readLanguageTag('[')).toBeUndefined();
    expect(readLanguageTag('[e')).toBeUndefined();
  });

  it('gives back a translation that has no tag, whole', () => {
    expect(readLanguageTag('Hola')).toEqual({ code: null, rest: 'Hola' });
    expect(readLanguageTag('[laughs] Hola')).toEqual({ code: null, rest: '[laughs] Hola' });
    expect(readLanguageTag('[a very long aside without end')).toEqual({
      code: null,
      rest: '[a very long aside without end',
    });
  });
});
