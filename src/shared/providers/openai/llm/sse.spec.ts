import { describe, expect, it, vi } from 'vitest';
import { readSseFrames } from './sse';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe('readSseFrames', () => {
  it('parses frames split across network chunks and skips [DONE]', async () => {
    const frames: unknown[] = [];
    await readSseFrames(
      streamOf('data: {"a":1}\n\ndata: {"b"', ':2}\n\n', 'data: [DONE]\n\n'),
      (frame) => frames.push(frame),
    );

    expect(frames).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips a broken frame and keeps reading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const frames: unknown[] = [];
    await readSseFrames(streamOf('data: {oops\n', 'data: {"ok":true}\n'), (frame) =>
      frames.push(frame),
    );

    expect(frames).toEqual([{ ok: true }]);
  });
});

describe('readSseFrames with a signal', () => {
  it('reads a last frame that has no newline after it', async () => {
    const frames: unknown[] = [];
    await readSseFrames(streamOf('data: {"a":1}\n', 'data: {"a":2}'), (f) => frames.push(f));
    expect(frames).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('lets an error thrown by the consumer through, instead of calling it a broken frame', async () => {
    const boom = new Error('consumer bug');
    await expect(
      readSseFrames(streamOf('data: {"a":1}\n'), () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('rejects with the abort reason and cancels the stream', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('data: {"a":1}\n\n'));
      },
      cancel,
    });
    const frames: unknown[] = [];
    const reading = readSseFrames(
      body,
      (frame) => {
        frames.push(frame);
        controller.abort();
      },
      controller.signal,
    );

    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(frames).toEqual([{ a: 1 }]);
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects at once when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      readSseFrames(streamOf('data: {}\n\n'), vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
