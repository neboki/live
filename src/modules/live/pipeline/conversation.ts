// Two people, two languages, one phone. The user speaks the target language and the
// other person their own; each sentence goes into the other's language. Who said it
// comes from the language it was said in, which is far more reliable between two
// languages than telling voices apart. That language is read, in this order, from the
// text itself, from the transcriber, and as a last resort from the translator, which is
// asked to name it before its translation.

import { guessLanguage } from './textLanguage';
import type { Partner } from './types';

/** Speaker numbers in a two-way conversation */
export const USER_SPEAKER = 0;
export const PARTNER_SPEAKER = 1;

/** Longest tag the translator may start with, "[pt-BR]" and a little room */
const MAX_TAG = 12;
const TAG = /^\s*\[([a-z]{2,3}(?:[-_][a-z]{2,4})?)\]\s*/i;

/** "en", "en-US" or "English" all match "en" / "English". */
export function sameLanguage(detected: string, code: string, name: string): boolean {
  const spoken = detected.trim().toLowerCase();
  const base = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0] ?? '';
  return base(spoken) === base(code) || spoken === name.toLowerCase();
}

/** The speaker whose language `language` is, or null for a third (or no) language */
function ownerOf(
  language: string | undefined,
  user: { code: string; language: string },
  partner: Partner,
): number | null {
  if (!language) return null;
  if (sameLanguage(language, user.code, user.language)) return USER_SPEAKER;
  if (sameLanguage(language, partner.code, partner.language)) return PARTNER_SPEAKER;
  return null;
}

/**
 * Who said a sentence: the user when it is in their language, the other person when it
 * is in theirs. The words decide when they clearly belong to one of the two languages;
 * otherwise the language the transcriber heard; null when neither can tell.
 */
export function speakerOf(
  language: string | undefined,
  user: { code: string; language: string },
  partner: Partner,
  text = '',
): number | null {
  const written = text ? guessLanguage(text, [user.code, partner.code]) : null;
  return ownerOf(written ?? undefined, user, partner) ?? ownerOf(language, user, partner);
}

/** The speaker the translator says a sentence came from, by the code it named */
export function speakerOfTag(
  code: string | null,
  user: { code: string; language: string },
  partner: Partner,
): number | null {
  return ownerOf(code ?? undefined, user, partner);
}

/** Where a sentence goes: the language to write it in, or null when nobody wants it */
export function routeOf(
  speaker: number | null,
  userLanguage: string,
  partner: Partner,
): string | null {
  if (speaker === USER_SPEAKER) return partner.toPartner() ? partner.language : null;
  if (speaker === PARTNER_SPEAKER) return partner.toUser() ? userLanguage : null;
  // Unknown: the translator picks the direction from the text, and says which it was
  return `${userLanguage}, but if the fragment is already in ${userLanguage}, translate it into ${partner.language} instead. Start with the fragment's language code in square brackets, like [${partner.code}]`;
}

export interface LanguageTag {
  /** The code the translator named; null when it named none */
  code: string | null;
  /** The translation after the tag */
  rest: string;
}

/**
 * Splits the language tag off the start of a streamed translation. Undefined while the
 * text so far could still be the start of a tag; a translation without one comes back
 * whole, with no code.
 */
export function readLanguageTag(text: string): LanguageTag | undefined {
  const match = TAG.exec(text);
  if (match) return { code: match[1]?.toLowerCase() ?? null, rest: text.slice(match[0].length) };
  const start = text.trimStart();
  if (!start) return undefined;
  if (start.startsWith('[') && !start.includes(']') && start.length < MAX_TAG) return undefined;
  return { code: null, rest: text };
}
