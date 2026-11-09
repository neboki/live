// Where a streamed translation can already be read aloud: a sentence is complete once its
// end is followed by a space and the next word has started, so "3.5" or a trailing full
// stop still being typed are never cut.

/** A sentence end (maybe closed by quotes or brackets), a space, and the next word begun */
const SENTENCE_BOUNDARY = /[.!?…。！？]["'”’»)\]]*\s+(?=\S)/g;
/**
 * A dot after one of these is an abbreviation, not a sentence end ("Dr. Smith", "e.g. this",
 * "Sr. García"). Lower-cased, without the dot.
 */
const ABBREVIATIONS = new Set([
  'dr',
  'dra',
  'mr',
  'mrs',
  'ms',
  'prof',
  'sr',
  'sra',
  'srta',
  'st',
  'vs',
  'etc',
  'eg',
  'ie',
  'e.g',
  'i.e',
  'no',
  'nº',
  'núm',
  'p',
  'pp',
  'pág',
  'fig',
  'ing',
  'lic',
  'ud',
  'uds',
  'dña',
  'jr',
  'inc',
  'ltd',
  'co',
  'approx',
  'dept',
  'av',
  'avda',
  'cf',
]);

/** True when the dot at `index` closes an abbreviation or a single initial ("J. Smith"). */
function isAbbreviation(text: string, index: number): boolean {
  if (text[index] !== '.') return false;
  const word = /([\p{L}.º]+)$/u.exec(text.slice(0, index))?.[1] ?? '';
  if (!word) return false;
  const lower = word.toLocaleLowerCase();
  return ABBREVIATIONS.has(lower) || /^\p{Lu}$/u.test(word);
}

/**
 * The index after the last complete sentence of `text` at or past `from`, or `from` when
 * no sentence has been completed since.
 */
export function spokenUpTo(text: string, from: number): number {
  const rest = text.slice(from);
  let end = from;
  for (const match of rest.matchAll(SENTENCE_BOUNDARY)) {
    if (isAbbreviation(text, from + match.index)) continue;
    end = from + match.index + match[0].length;
  }
  return end;
}
