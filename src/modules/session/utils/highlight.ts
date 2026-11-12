/** A stretch of text, and whether it is what the reader searched for */
export interface TextPart {
  text: string;
  hit: boolean;
}

/**
 * Splits a text around every place the search appears in it, whatever its case, so the
 * matches can be marked. Without a search, or without a match, the text comes back whole.
 */
export function highlightParts(text: string, search: string, locale?: string): TextPart[] {
  const needle = search.trim().toLocaleLowerCase(locale);
  const hay = text.toLocaleLowerCase(locale);
  // A few letters change length in lower case (İ): positions would no longer line up
  if (!needle || hay.length !== text.length) return [{ text, hit: false }];
  const parts: TextPart[] = [];
  let from = 0;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    from = at + needle.length;
    parts.push({ text: text.slice(at, from), hit: true });
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}
