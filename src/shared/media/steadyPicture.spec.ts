import { describe, expect, it } from 'vitest';
import { steadyPicture } from './steadyPicture';

describe('steadyPicture', () => {
  it('leaves a stream without picture as it is', () => {
    const soundOnly = { getVideoTracks: () => [], getAudioTracks: () => [] };
    expect(steadyPicture(soundOnly as unknown as MediaStream)).toBeNull();
  });

  it('leaves the stream as it is where the browser cannot copy a picture', () => {
    // No canvas to paint on here (jsdom): the tab is then recorded directly
    const picture = { getVideoTracks: () => [{}], getAudioTracks: () => [] };
    expect(steadyPicture(picture as unknown as MediaStream)).toBeNull();
  });
});
