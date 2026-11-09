import { logError } from '@/shared/errors';

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

/**
 * Reads a Server-Sent Events body and hands over every `data:` frame parsed.
 * A network chunk can split a line in two, so the tail is carried over.
 * Aborting `signal` cancels the reader and rejects with the abort reason.
 */
/** One SSE line: a data frame is parsed and handed over; anything else is skipped. */
function readLine<T>(line: string, onFrame: (frame: T) => void): void {
  if (!line.startsWith('data:')) return;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return;
  let frame: T;
  try {
    frame = JSON.parse(payload) as T;
  } catch (err) {
    // One broken frame shouldn't lose everything after it
    logError('Unreadable stream frame', err);
    return;
  }
  // Outside the try: a bug in the consumer is not a broken frame and must not be hidden
  onFrame(frame);
}

export async function readSseFrames<T>(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: T) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    await body.cancel().catch(() => undefined);
    throw abortReason(signal);
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const onAbort = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortReason(signal);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach((line) => readLine(line, onFrame));
    }
    // A stream may end without a final newline: its last frame still counts
    buffer += decoder.decode();
    if (buffer) readLine(buffer, onFrame);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
