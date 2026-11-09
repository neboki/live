import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEXT_LAG_MS,
  MAX_TEXT_LAG_MS,
  ONSET_GAP_MS,
  createSpeechTiming,
  hearChunk,
  spokenOn,
} from './interpreterTiming';

describe('interpreterTiming', () => {
  it('dates the first text after a start of speech by that start, and learns the lateness', () => {
    const timing = createSpeechTiming();
    hearChunk(timing, true, 100, 10_100); // speech from 10 000
    hearChunk(timing, true, 100, 10_200);
    expect(spokenOn(timing, 12_000)).toBe(10_000);
    expect(timing.lagMs).toBeGreaterThan(DEFAULT_TEXT_LAG_MS);
    expect(timing.lagMs).toBeLessThan(2000);
  });

  it('dates text with no start of its own back by the measured lateness', () => {
    const timing = createSpeechTiming();
    expect(spokenOn(timing, 20_000)).toBe(20_000 - DEFAULT_TEXT_LAG_MS);
  });

  it('takes only a pause of speech as a start, not every loud chunk', () => {
    const timing = createSpeechTiming();
    hearChunk(timing, true, 100, 1100);
    spokenOn(timing, 3000);
    hearChunk(timing, false, 100, 3100);
    hearChunk(timing, true, 100, 3200); // a breath shorter than the gap: same speech
    expect(timing.onset).toBeNull();
    for (let i = 0; i < ONSET_GAP_MS / 100; i += 1) hearChunk(timing, false, 100, 3300 + i * 100);
    hearChunk(timing, true, 100, 4000);
    expect(timing.onset).toBe(3900);
  });

  it('leaves the start for later text when text comes too soon after it', () => {
    const timing = createSpeechTiming();
    hearChunk(timing, true, 100, 5100);
    // The tail of what was said before the start
    expect(spokenOn(timing, 5200)).toBe(5200 - DEFAULT_TEXT_LAG_MS);
    expect(spokenOn(timing, 6500)).toBe(5000);
  });

  it('forgets a start no text came for', () => {
    const timing = createSpeechTiming();
    hearChunk(timing, true, 100, 5100);
    expect(spokenOn(timing, 5000 + MAX_TEXT_LAG_MS + 1)).toBe(
      5000 + MAX_TEXT_LAG_MS + 1 - DEFAULT_TEXT_LAG_MS,
    );
    expect(timing.onset).toBeNull();
  });
});
