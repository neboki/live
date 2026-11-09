// Two people, two languages, one phone. The user speaks the target language and the
// other person their own; each sentence goes into the other's language. Who said it
// comes from the language the transcriber hears, which is far more reliable between two
// languages than telling voices apart.

import type { Partner } from './types';

/** Speaker numbers in a two-way conversation */
export const USER_SPEAKER = 0;
export const PARTNER_SPEAKER = 1;

/** "en", "en-US" or "English" all match "en" / "English". */
export function sameLanguage(detected: string, code: string, name: string): boolean {
  const spoken = detected.trim().toLowerCase();
  const base = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0] ?? '';
  return base(spoken) === base(code) || spoken === name.toLowerCase();
}

/**
 * Who said a sentence heard in `language`: the user when it is theirs, the other person
 * when it is the partner's, null when the transcriber did not say or heard a third one.
 */
export function speakerOf(
  language: string | undefined,
  user: { code: string; language: string },
  partner: Partner,
): number | null {
  if (!language) return null;
  if (sameLanguage(language, user.code, user.language)) return USER_SPEAKER;
  if (sameLanguage(language, partner.code, partner.language)) return PARTNER_SPEAKER;
  return null;
}

/** Where a sentence goes: the language to write it in, or null when nobody wants it */
export function routeOf(
  speaker: number | null,
  userLanguage: string,
  partner: Partner,
): string | null {
  if (speaker === USER_SPEAKER) return partner.toPartner() ? partner.language : null;
  if (speaker === PARTNER_SPEAKER) return partner.toUser() ? userLanguage : null;
  // Unknown: the translator picks the direction from the text itself
  return `${userLanguage} (but if the fragment is already in ${userLanguage}, translate it into ${partner.language} instead)`;
}
