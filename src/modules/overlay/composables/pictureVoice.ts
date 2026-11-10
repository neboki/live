// Which translated lines to read aloud while the shared tab plays behind time.
//
// With the picture held back, reading each translation as soon as it is written would
// speak it seconds before its sentence is on screen. Instead each line is read when the
// picture reaches the sentence, as a dubbed film would, and one the picture has already
// left behind (a jump ahead, a caption that came far too late) is not read at all.

import type { SessionLine } from '@/modules/session';

/** A line is still read this long after its sentence ended on the picture; later, never */
export const LATE_VOICE_MS = 1500;

/** The shared tab's picture, as the voice needs it */
export interface PictureClock {
  /** Seconds behind real time; null while it is held before it first shows */
  lagSeconds: number | null;
  /** Paused by the user */
  paused: boolean;
}

export interface DueLines {
  /** Lines to read now, in order */
  due: SessionLine[];
  /** Index of the first line not yet reached by the picture */
  next: number;
}

/**
 * The lines from index `next` on that a picture showing real time `shownAt` (epoch ms)
 * has reached: those still on screen are due, those it has left behind are passed over.
 * A line said in the target language is passed over too: the picture's own sound says it.
 */
export function dueLines(lines: readonly SessionLine[], next: number, shownAt: number): DueLines {
  const due: SessionLine[] = [];
  let index = next;
  for (; index < lines.length; index++) {
    const line = lines[index];
    if (!line || (line.from ?? line.at) > shownAt) break;
    const said = line.translation.trim();
    if (said && said !== line.source.trim() && shownAt <= line.at + LATE_VOICE_MS) due.push(line);
  }
  return { due, next: index };
}
