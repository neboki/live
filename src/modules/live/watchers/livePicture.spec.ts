import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { createLivePicture } from './livePicture';

function setup(picture: MediaStream | null = {} as MediaStream) {
  const wanted = ref(false);
  const capture = {
    originalPicture: vi.fn(() => picture),
    hideOriginalPicture: vi.fn(),
  };
  const stream = createLivePicture({ capture, wanted: () => wanted.value });
  return { wanted, capture, stream };
}

describe('createLivePicture', () => {
  it('shows the live picture while wanted, and lets it go after', async () => {
    const { wanted, capture, stream } = setup();
    expect(stream.value).toBeNull();

    wanted.value = true;
    await nextTick();
    expect(stream.value).not.toBeNull();
    expect(capture.originalPicture).toHaveBeenCalledTimes(1);

    wanted.value = false;
    await nextTick();
    expect(stream.value).toBeNull();
    expect(capture.hideOriginalPicture).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when the share has no picture', async () => {
    const { wanted, capture, stream } = setup(null);
    wanted.value = true;
    await nextTick();
    expect(stream.value).toBeNull();

    wanted.value = false;
    await nextTick();
    expect(capture.hideOriginalPicture).not.toHaveBeenCalled();
  });
});
