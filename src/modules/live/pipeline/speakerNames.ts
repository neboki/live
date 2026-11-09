// A speaker who introduces themselves names their voice: "Soy Ana", "My name is Jim".
// Only plain self-introductions are trusted (the name is the speaker's own), and only a
// capitalised word counts as a name, so "soy ingeniero" or "I'm fine" name nobody.
// Free and on the device; a wrong name is fixed with one tap in the captions.

const NAME = String.raw`(\p{Lu}[\p{L}'’-]{1,20}(?:\s\p{Lu}[\p{L}'’-]{1,20})?)`;

/** Spanish, Catalan, Portuguese, Italian, French, German and English introductions */
const PHRASES = [
  'me llamo',
  'mi nombre es',
  'soy',
  'em dic',
  'meu nome é',
  'me chamo',
  'mi chiamo',
  "je m'appelle",
  'je m’appelle',
  "moi c'est",
  'ich heiße',
  'ich heisse',
  'ich bin',
  'mein name ist',
  'my name is',
  "i'm",
  'i’m',
  'i am',
];

/** "soy" → "[sS][oO][yY]": the phrase in any case, while the name must stay capitalised */
function anyCase(phrase: string): string {
  return [...phrase]
    .map((char) => {
      const lower = char.toLowerCase();
      const upper = char.toUpperCase();
      if (lower === upper) return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `[${lower}${upper}]`;
    })
    .join('');
}

const INTRODUCTION = new RegExp(
  String.raw`(?:^|[\s¡¿,.;:!?"«])(?:${PHRASES.map(anyCase).join('|')})\s+${NAME}`,
  'u',
);

/** Capitalised words that follow "I'm" or "soy" without being anyone's name */
const NOT_NAMES = new Set([
  'I',
  'A',
  'The',
  'El',
  'La',
  'Un',
  'Una',
  'Le',
  'Der',
  'Die',
  'Das',
  'Ein',
  'Eine',
]);

/** The speaker's own name when the sentence introduces them; null otherwise. */
export function introducedName(text: string): string | null {
  const name = INTRODUCTION.exec(text)?.[1]?.trim();
  const first = name?.split(/\s/)[0];
  if (!name || !first || NOT_NAMES.has(first)) return null;
  return name;
}
