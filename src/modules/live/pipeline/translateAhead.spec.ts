import { describe, expect, it, vi } from 'vitest';
import { deferred } from './livePipeline.fakes';
import { translateAhead } from './translateAhead';

describe('translateAhead', () => {
  it('asks at once and keeps what arrives until its turn, then passes the rest along', async () => {
    const end = deferred<undefined>();
    let say: (chunk: string) => void = () => undefined;
    const call = vi.fn((onDelta: (chunk: string) => void) => {
      say = onDelta;
      return end.promise.then(() => undefined);
    });
    const ahead = translateAhead(call);
    expect(call).toHaveBeenCalledTimes(1);
    say('Hola ');
    say('a ');

    const shown: string[] = [];
    const consumed = ahead.consume((chunk) => shown.push(chunk));
    expect(shown).toEqual(['Hola a ']);
    say('todos');
    expect(shown).toEqual(['Hola a ', 'todos']);
    end.resolve(undefined);
    await expect(consumed).resolves.toBeUndefined();
  });

  it('tells the call whether any words came yet, and reports its failure at its turn', async () => {
    const failure = new Error('down');
    let seen: boolean[] = [];
    const ahead = translateAhead(async (onDelta, produced) => {
      seen = [produced()];
      onDelta('x');
      seen.push(produced());
      throw failure;
    });
    await Promise.resolve();
    expect(seen).toEqual([false, true]);
    const shown: string[] = [];
    await expect(ahead.consume((chunk) => shown.push(chunk))).rejects.toBe(failure);
    expect(shown).toEqual(['x']);
  });
});
