import type { SessionLine } from '../types';
import { clock } from './toMarkdown';

/** About 40 000 tokens: hours of conversation, and well inside what the models read */
export const MAX_TRANSCRIPT_CHARS = 160_000;
/** Sentences that say what a conversation is about, to name it */
export const OPENING_LINES = 40;
const CUT = '[…]';

function sentence(line: SessionLine): string {
  const voice = line.speaker === undefined ? '' : ` Voice ${line.speaker + 1}:`;
  return `[${clock(line.at)}]${voice} ${line.source}`;
}

/**
 * A conversation as the text the AI reads: one sentence per line, as it was heard, with
 * its time and its voice when known. One too long to send keeps its beginning and its
 * end, where what was agreed usually is, with a mark where the middle was left out.
 */
export function transcriptText(
  lines: readonly SessionLine[],
  maxChars: number = MAX_TRANSCRIPT_CHARS,
): string {
  const text = lines.map(sentence).join('\n');
  if (text.length <= maxChars) return text;
  const half = Math.floor((maxChars - CUT.length) / 2);
  const head = text.slice(0, text.lastIndexOf('\n', half));
  const tail = text.slice(text.indexOf('\n', text.length - half) + 1);
  return `${head}\n${CUT}\n${tail}`;
}

/** How a conversation begins, as the text the AI reads */
export function transcriptOpening(lines: readonly SessionLine[]): string {
  return transcriptText(lines.slice(0, OPENING_LINES));
}
