import { describe, expect, it } from 'vitest';
import { PARTNER_SPEAKER, routeOf, speakerOf, USER_SPEAKER } from './conversation';
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

  it('lets the translator choose when the language is unknown', () => {
    expect(routeOf(null, 'Spanish', partner())).toContain('into English instead');
  });
});
