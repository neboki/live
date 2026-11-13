// A translation asked for as soon as its sentence is heard, shown when its turn comes.
//
// Captions show one after another, in the order heard. Asking for each translation only
// when the one before it was finished made a slow answer hold every sentence behind it,
// and the ones that piled up were then sent together and came back as one long caption:
// nothing for a while, then a wall of text. Here each sentence is asked for at once, on
// its own, and what comes back is kept until the captions get to it. A slow answer then
// delays only its own caption, and every caption stays as short as its sentence.

/** Asks for a translation: `onDelta` gets its words, `produced` says whether any came yet */
export type AheadCall = (
  onDelta: (chunk: string) => void,
  produced: () => boolean,
) => Promise<void>;

export interface TranslationAhead {
  /**
   * Its turn came: `onChunk` gets what has arrived so far, at once, then the rest as it
   * arrives. Resolves when the translation is complete, or rejects as the call did.
   */
  consume: (onChunk: (chunk: string) => void) => Promise<void>;
}

export function translateAhead(call: AheadCall): TranslationAhead {
  /** What arrived before its turn */
  let kept = '';
  let produced = false;
  let listener: ((chunk: string) => void) | null = null;
  const done = call(
    (chunk) => {
      produced = true;
      if (listener) listener(chunk);
      else kept += chunk;
    },
    () => produced,
  );
  // A failure is reported when its turn comes, by consume(); until then it is not unhandled
  done.catch(() => undefined);

  function consume(onChunk: (chunk: string) => void): Promise<void> {
    listener = onChunk;
    if (kept) onChunk(kept);
    kept = '';
    return done;
  }

  return { consume };
}
