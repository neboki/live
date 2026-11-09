// Which of a few known languages a sentence is written in, from the text alone. A
// conversation knows its two languages, so this only has to tell them apart: by script
// (Cyrillic, Arabic, Han…) and, between languages written alike, by their commonest words
// and letters. Short or ambiguous sentences ("OK", "taxi") stay unknown on purpose.

type Script = 'latin' | 'cyrillic' | 'arabic' | 'devanagari' | 'han' | 'kana' | 'hangul';

const SCRIPT_OF: Readonly<Record<string, Script>> = {
  ru: 'cyrillic',
  uk: 'cyrillic',
  ar: 'arabic',
  hi: 'devanagari',
  zh: 'han',
  ja: 'kana',
  ko: 'hangul',
};

const SCRIPT_TEST: Readonly<Record<Script, RegExp>> = {
  latin: /[a-zà-ÿąćęłńśźżăâîșțğışçœæøåß]/giu,
  cyrillic: /\p{Script=Cyrillic}/gu,
  arabic: /\p{Script=Arabic}/gu,
  devanagari: /\p{Script=Devanagari}/gu,
  han: /\p{Script=Han}/gu,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu,
  hangul: /\p{Script=Hangul}/gu,
};

/** The commonest short words of the languages that share a script with another one */
const COMMON_WORDS: Readonly<Record<string, string>> = {
  en: "the an and is are was were be to of in on at it this that you i we they he she my your not no yes do does did have has what where when how why who can will would please thank thanks hello hi okay ok sorry from with for but so there here me two three just all more well good very it's i'm don't can't that's what's let's",
  es: 'el la los las un una y es son está están estoy era de del en con por para que qué no sí yo tú usted nosotros me te se lo le mi su muy pero como cómo dónde cuándo hola gracias vale bueno hay este esta eso aquí allí también porque al dos tres ya más bien tengo tiene voy puedo quiero sé',
  fr: 'le la les un une et est sont de du des en au aux avec pour que qui ne pas oui non je tu vous nous il elle ce cette mon ton son mais où quand comment bonjour merci très ici avez suis',
  de: 'der die das ein eine und ist sind war zu von mit für auf nicht ja nein ich du sie wir er es mein dein aber wo wann wie warum hallo danke bitte sehr hier auch haben bin',
  it: 'il lo la gli le un una e è sono di del della in con per che non sì io tu lei noi mi ti si mio ma dove quando come perché ciao grazie molto qui anche ho',
  pt: 'o a os as um uma e é são está estão de do da em no na com por para que não sim eu você nós me te se meu mas onde quando como olá obrigado obrigada muito aqui também tem',
  nl: 'de het een en is zijn was van in op met voor niet ja nee ik jij je wij we hij zij mijn maar waar wanneer hoe waarom hallo dank bedankt alsjeblieft hier ook heb',
  ca: 'el la els les un una i és són està de del en amb per que no sí jo tu vostè nosaltres em et es meu però on quan com hola gràcies molt aquí també hi ha',
  eu: 'eta da dira ez bai ni zu gu hau hori zer non noiz nola zergatik kaixo eskerrik asko mesedez oso hemen ere dut duzu naiz zara bat',
  gl: 'o a os as un unha e é son está de do da en no na con por para que non si eu ti vostede nós me te se meu pero onde cando como ola grazas moi aquí tamén hai',
  pl: 'i w z na do nie tak jest są był to ten ta że ja ty my on ona mój ale gdzie kiedy jak dlaczego cześć dziękuję proszę bardzo tutaj też mam',
  ro: 'și în la cu pentru de pe nu da este sunt era eu tu noi el ea meu dar unde când cum ce bună mulțumesc vă rog foarte aici am',
  sv: 'och är var att av i på med för inte ja nej jag du vi han hon min men när hur varför hej tack snälla mycket här också har det en ett',
  tr: 've bir bu şu o ben sen biz evet hayır değil var yok için ile ne nerede zaman nasıl neden merhaba teşekkür lütfen çok burada da de mı mi',
  ru: 'и в не на я ты мы он она это что как где когда почему да нет привет спасибо пожалуйста очень здесь тоже есть был',
  uk: 'і в не на я ти ми він вона це що як де коли чому так ні привіт дякую будь ласка дуже тут також є був',
};

const WORDS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(COMMON_WORDS).map(([code, words]) => [code, new Set(words.split(' '))]),
);

/** Letters only one language of a pair is likely to use */
const LETTERS: Readonly<Record<string, RegExp>> = {
  es: /[ñ¿¡]/u,
  de: /[ßäöü]/u,
  fr: /[çœêèëâîôûù]/u,
  pt: /[ãõç]/u,
  ca: /(l·l|[àèòç])/u,
  pl: /[ąćęłńśźż]/u,
  ro: /[ăâîșț]/u,
  sv: /[åäö]/u,
  tr: /[ğışç]/u,
  uk: /[іїєґ]/u,
  ru: /[ыэъё]/u,
};
/** A telling letter counts as much as one and a half common words */
const LETTER_WEIGHT = 1.5;
const WORD = /[\p{L}·']+/gu;

function baseOf(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0] ?? '';
}

function scriptOf(code: string): Script {
  return SCRIPT_OF[code] ?? 'latin';
}

function countOf(text: string, script: Script): number {
  return text.match(SCRIPT_TEST[script])?.length ?? 0;
}

/** Japanese mixes Han with kana; Chinese is Han alone, with no kana at all */
function scriptScore(text: string, code: string): number {
  const kana = countOf(text, 'kana');
  if (code === 'ja') return kana ? kana * 2 + countOf(text, 'han') : 0;
  if (code === 'zh') return kana ? 0 : countOf(text, 'han');
  return countOf(text, scriptOf(code));
}

function wordScore(lower: string, code: string): number {
  const words = WORDS.get(code);
  const tokens = lower.match(WORD) ?? [];
  const common = words ? tokens.filter((token) => words.has(token)).length : 0;
  return common + (LETTERS[code]?.test(lower) ? LETTER_WEIGHT : 0);
}

/** The best-scored code, when it beats the next one by at least `margin` */
function winner(
  codes: readonly string[],
  score: (code: string) => number,
  margin: number,
): string | null {
  const ranked = codes
    .map((code) => ({ code, score: score(code) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = ranked;
  if (!best || best.score <= 0) return null;
  return best.score - (second?.score ?? 0) >= margin ? best.code : null;
}

/**
 * The one of `codes` (ISO 639-1) `text` is written in, or null when it cannot tell them
 * apart with confidence. Different scripts decide first; then common words and letters.
 */
export function guessLanguage(text: string, codes: readonly string[]): string | null {
  const candidates = [...new Set(codes.map(baseOf).filter(Boolean))];
  if (candidates.length < 2 || !text.trim()) return null;
  if (new Set(candidates.map(scriptOf)).size > 1) {
    const byScript = winner(candidates, (code) => scriptScore(text, code), Number.EPSILON);
    if (byScript) return byScript;
  }
  const lower = text.toLowerCase();
  return winner(candidates, (code) => wordScore(lower, code), 1);
}
