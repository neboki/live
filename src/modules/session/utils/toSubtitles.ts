// The conversation as subtitles (SRT or WebVTT), one cue per sentence, timed from the
// session start, so a recording of the call can carry the captions.

import type { SessionLine, SessionSnapshot } from '../types';

export type SubtitleFormat = 'srt' | 'vtt';

/** Without a known start, a sentence is assumed to have taken this long */
const DEFAULT_LINE_MS = 3000;
/** No cue is shorter than this, so it can be read */
const MIN_LINE_MS = 800;

interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** HH:MM:SS,mmm for SRT; HH:MM:SS.mmm for WebVTT */
function stamp(ms: number, format: SubtitleFormat): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const separator = format === 'srt' ? ',' : '.';
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`;
}

/** The caption of a line: its translation, or the original when there was none */
function textOf(line: SessionLine): string {
  return (line.translation.trim() || line.source.trim()).replace(/\s*\n\s*/g, ' ');
}

/** Sentences as cues that never overlap and always last long enough to be read. */
export function toCues(record: SessionSnapshot): Cue[] {
  const origin = record.startedAt ?? record.lines[0]?.from ?? record.lines[0]?.at ?? 0;
  const cues: Cue[] = [];
  let previousEnd = 0;
  for (const line of record.lines) {
    const text = textOf(line);
    if (!text) continue;
    const endMs = Math.max(line.at - origin, previousEnd + MIN_LINE_MS);
    const wanted = line.from === undefined ? endMs - DEFAULT_LINE_MS : line.from - origin;
    const startMs = Math.min(Math.max(wanted, previousEnd), endMs - MIN_LINE_MS);
    cues.push({ startMs: Math.max(0, startMs), endMs, text });
    previousEnd = endMs;
  }
  return cues;
}

export function toSubtitles(record: SessionSnapshot, format: SubtitleFormat): string {
  const cues = toCues(record);
  const blocks = cues.map((cue, index) => {
    const timing = `${stamp(cue.startMs, format)} --> ${stamp(cue.endMs, format)}`;
    const head = format === 'srt' ? `${index + 1}\n${timing}` : timing;
    return `${head}\n${cue.text}`;
  });
  const body = blocks.join('\n\n');
  return format === 'vtt' ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}
