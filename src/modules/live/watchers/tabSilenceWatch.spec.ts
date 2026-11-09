import { describe, expect, it, vi } from 'vitest';
import { TARGET_SAMPLE_RATE } from '@/shared/audio/pcm';
import { TAB_SILENT_AFTER_MS, createTabSilenceWatch } from './tabSilenceWatch';

/** 100 ms of audio, silent or not */
function chunk(sound: boolean): Int16Array {
  const pcm = new Int16Array(TARGET_SAMPLE_RATE / 10);
  if (sound) pcm[10] = 500;
  return pcm;
}

const SILENT_CHUNKS = TAB_SILENT_AFTER_MS / 100;

describe('createTabSilenceWatch', () => {
  it('says the tab is silent after a stretch of exact zeros, once', () => {
    const onChange = vi.fn();
    const watch = createTabSilenceWatch({ onChange });
    watch.start();
    for (let i = 0; i < SILENT_CHUNKS - 1; i++) watch.chunk(chunk(false));
    expect(onChange).not.toHaveBeenCalled();
    watch.chunk(chunk(false));
    watch.chunk(chunk(false));
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('clears as soon as there is sound, and counts again from zero', () => {
    const onChange = vi.fn();
    const watch = createTabSilenceWatch({ onChange });
    watch.start();
    for (let i = 0; i < SILENT_CHUNKS; i++) watch.chunk(chunk(false));
    watch.chunk(chunk(true));
    for (let i = 0; i < SILENT_CHUNKS - 1; i++) watch.chunk(chunk(false));
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('ignores chunks while not watching, and clears on stop', () => {
    const onChange = vi.fn();
    const watch = createTabSilenceWatch({ onChange });
    for (let i = 0; i < SILENT_CHUNKS; i++) watch.chunk(chunk(false));
    expect(onChange).not.toHaveBeenCalled();
    watch.start();
    for (let i = 0; i < SILENT_CHUNKS; i++) watch.chunk(chunk(false));
    watch.stop();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });
});
