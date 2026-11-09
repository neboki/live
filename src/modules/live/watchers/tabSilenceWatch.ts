// A shared tab whose video is paused (or not started) sends exact zeros: nothing to
// translate, and nothing says why. The page cannot press play in another tab, so the
// session tells the user to do it once the tab has been fully silent for a while. Real
// quiet in a playing video is rarely exact zeros for long, and any sound clears it.

import { TARGET_SAMPLE_RATE } from '@/shared/audio/pcm';

/** Pure silence for this long means the tab is most likely paused */
export const TAB_SILENT_AFTER_MS = 3000;

export interface TabSilenceWatch {
  /** Watches from now on; call when a session that listens to a tab is running */
  start: () => void;
  /** Stops watching and clears a pending silence */
  stop: () => void;
  /** Every chunk captured */
  chunk: (pcm: Int16Array) => void;
}

export interface TabSilenceWatchOptions {
  /** The tab went silent (true) or was heard again (false); called on changes only */
  onChange: (silent: boolean) => void;
}

function hasSound(pcm: Int16Array): boolean {
  return pcm.some((sample) => sample !== 0);
}

export function createTabSilenceWatch({ onChange }: TabSilenceWatchOptions): TabSilenceWatch {
  let watching = false;
  let silentMs = 0;
  let silent = false;

  function set(next: boolean): void {
    if (silent === next) return;
    silent = next;
    onChange(next);
  }

  function start(): void {
    watching = true;
    silentMs = 0;
  }

  function stop(): void {
    watching = false;
    silentMs = 0;
    set(false);
  }

  function chunk(pcm: Int16Array): void {
    if (!watching) return;
    if (hasSound(pcm)) {
      silentMs = 0;
      set(false);
      return;
    }
    silentMs += (pcm.length / TARGET_SAMPLE_RATE) * 1000;
    if (silentMs >= TAB_SILENT_AFTER_MS) set(true);
  }

  return { start, stop, chunk };
}
