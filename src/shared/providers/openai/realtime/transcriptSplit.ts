// Where the text of a sentence still being spoken can be handed to the translator.
//
// The live transcription model writes word by word while people speak, about 0.8 s
// behind them, punctuation included (measured 2026-11-15). So a long stretch of speech
// is split by its text, at the end of a sentence or of a clause, instead of by cutting
// the audio after a fixed time: a cut in the middle of a word made the transcriber
// write the loose end as an empty, repeated or invented sentence.

/** Words (about 4 s of speech) after which a clause end is enough to split */
export const SOFT_WORDS = 12;
/** Shortest piece a clause end may leave behind it */
const MIN_CLAUSE_WORDS = 5;
/** Words after which speech without any punctuation is split anyway, before its last word */
export const HARD_WORDS = 22;

const SENTENCE_END = /([.?!…]+["'”’»)\]]*)\s+(?=\S)|([。？！]+[」』”]*)(?=\S)/gu;
const CLAUSE_END = /([,;:—–]["'”’»)\]]*)\s+(?=\S)|([、，；：])(?=\S)/gu;
const ENDS_SENTENCE = /[.?!…。？！]["'”’»)\]」』]*\s*$/u;
/** Scripts written without spaces: two characters weigh about a word */
const UNSPACED = /[぀-ヿ㐀-鿿가-힯]/gu;
/** A full stop after one of these is not the end of a sentence */
const ABBREVIATION =
  /^(mr|mrs|ms|dr|dra|prof|sr|sra|srta|st|vs|etc|núm|mt|jr|inc|ltd|approx|fig|ud|uds|dña|p|pp)$/iu;

/** How long a piece of text is, in words (or their equivalent in unspaced scripts). */
export function wordCount(text: string): number {
  const unspaced = text.match(UNSPACED)?.length ?? 0;
  const spaced = text.replace(UNSPACED, ' ').split(/\s+/u).filter(Boolean).length;
  return spaced + Math.ceil(unspaced / 2);
}

/** True when the text ends where a sentence does. */
export function endsSentence(text: string): boolean {
  return ENDS_SENTENCE.test(text);
}

/** "Mr.", "U.S.", "J." and the like: the full stop belongs to the word. */
function isAbbreviation(before: string): boolean {
  const word = before.split(/\s+/u).at(-1) ?? '';
  return word.includes('.') || ABBREVIATION.test(word) || /^\p{L}$/u.test(word);
}

/** End of the first sentence that is followed by more text, or 0. */
function sentenceEnd(text: string): number {
  for (const match of text.matchAll(SENTENCE_END)) {
    const mark = match[1] ?? match[2] ?? '';
    if (mark === '.' && isAbbreviation(text.slice(0, match.index))) continue;
    return match.index + mark.length;
  }
  return 0;
}

/** End of the last clause that leaves a piece long enough before it, or 0. */
function clauseEnd(text: string): number {
  let end = 0;
  for (const match of text.matchAll(CLAUSE_END)) {
    const at = match.index + (match[1] ?? match[2] ?? '').length;
    if (wordCount(text.slice(0, at)) >= MIN_CLAUSE_WORDS) end = at;
  }
  return end;
}

/**
 * How many characters of `text` (the words heard so far and not handed over yet) are a
 * piece ready for the translator; 0 when it should wait for more. A sentence is ready
 * once the next one has begun; a long one, at its last clause end; one with no
 * punctuation at all, before its last word.
 */
export function splitPoint(text: string): number {
  const sentence = sentenceEnd(text);
  if (sentence) return sentence;
  const words = wordCount(text);
  if (words < SOFT_WORDS) return 0;
  const clause = clauseEnd(text);
  if (clause) return clause;
  if (words < HARD_WORDS) return 0;
  const lastWord = text.trimEnd().search(/\s+\S+$/u);
  return lastWord > 0 ? lastWord : 0;
}
