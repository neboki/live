// Takes out of a streamed translation the tags the model leaks now and then: an echo of
// the ones its prompt uses (<transcript>) or one of its own ("</final_answer>" was shown
// at the end of a caption in a real run, 2026-11-15). They are never part of what was said.

/** A whole tag: a name of letters, digits, "_" or "-", nothing else inside */
const TAG = /<\/?[a-z][a-z0-9_-]{0,30}>/giu;
/** The end of a chunk that may be the start of a tag still to come */
const OPEN_TAG = /<(\/?[a-z][a-z0-9_-]{0,30}|\/)?$/iu;

export interface MarkupFilter {
  /** The text of this chunk that can be shown now; what may be a tag is held back */
  push: (chunk: string) => string;
  /** The stream ended: what was held back and turned out not to be a tag */
  flush: () => string;
  /** The stream starts over (a retried request) */
  reset: () => void;
}

export function createMarkupFilter(): MarkupFilter {
  let held = '';

  function push(chunk: string): string {
    const text = (held + chunk).replace(TAG, '');
    const open = OPEN_TAG.exec(text);
    held = open ? text.slice(open.index) : '';
    return open ? text.slice(0, open.index) : text;
  }

  function flush(): string {
    const rest = held;
    held = '';
    return rest;
  }

  return {
    push,
    flush,
    reset: () => {
      held = '';
    },
  };
}
