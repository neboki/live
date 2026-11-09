import { describe, expect, it, vi } from 'vitest';
import { INPUT_SAMPLE_RATE, MAX_BUFFERED_SECONDS } from '../config';
import { createAudioBacklog, createUsageMeter } from './realtimeTranslateEvents';

function seconds(n: number, value = 1): Int16Array {
  return new Int16Array(n * INPUT_SAMPLE_RATE).fill(value);
}

describe('createAudioBacklog', () => {
  it('keeps the newest audio up to its size, as one chunk', () => {
    const backlog = createAudioBacklog(2);
    expect(backlog.isEmpty()).toBe(true);
    expect(backlog.take()).toBeNull();
    backlog.hold(seconds(1, 1));
    backlog.hold(seconds(1, 2));
    backlog.hold(seconds(1, 3));
    expect(backlog.isEmpty()).toBe(false);
    const merged = backlog.take();
    expect(merged?.length).toBe(2 * INPUT_SAMPLE_RATE);
    expect(merged?.[0]).toBe(2);
    expect(merged?.at(-1)).toBe(3);
    expect(backlog.isEmpty()).toBe(true);
  });

  it('never drops the only chunk, however long, and defaults to the transcription size', () => {
    const backlog = createAudioBacklog();
    backlog.hold(seconds(MAX_BUFFERED_SECONDS + 5));
    expect(backlog.take()?.length).toBe((MAX_BUFFERED_SECONDS + 5) * INPUT_SAMPLE_RATE);
  });
});

describe('createUsageMeter', () => {
  it('reports in stretches, and whatever is left when forced', () => {
    const onUsage = vi.fn();
    const meter = createUsageMeter(onUsage);
    meter.add(5 * INPUT_SAMPLE_RATE);
    meter.report();
    expect(onUsage).not.toHaveBeenCalled();
    meter.add(10 * INPUT_SAMPLE_RATE);
    meter.report();
    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(onUsage.mock.calls[0]?.[0]).toMatchObject({ audioSeconds: 15 });
    meter.add(INPUT_SAMPLE_RATE);
    meter.report(true);
    expect(onUsage).toHaveBeenCalledTimes(4);
    expect(onUsage.mock.calls[2]?.[0]).toMatchObject({ audioSeconds: 1 });
  });
});
