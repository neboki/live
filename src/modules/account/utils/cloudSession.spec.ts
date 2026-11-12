import { describe, expect, it } from 'vitest';
import type { SessionLine } from '@/modules/session';
import {
  CHUNK_SIZE,
  chunkLines,
  chunksToWrite,
  cloudSessionId,
  fromCloudSession,
  toCloudSessionDoc,
} from './cloudSession';

function lines(count: number): SessionLine[] {
  return Array.from({ length: count }, (_, i) => ({
    at: i,
    source: `s${i}`,
    translation: `t${i}`,
  }));
}

describe('chunksToWrite', () => {
  it('writes nothing when no sentence is new', () => {
    expect(chunksToWrite(5, 5)).toEqual([]);
    expect(chunksToWrite(0, 0)).toEqual([]);
  });

  it('rewrites the partly filled chunk and adds the new ones', () => {
    expect(chunksToWrite(0, 1)).toEqual([0]);
    expect(chunksToWrite(10, 20)).toEqual([0]);
    expect(chunksToWrite(CHUNK_SIZE - 1, CHUNK_SIZE + 1)).toEqual([0, 1]);
    expect(chunksToWrite(CHUNK_SIZE, CHUNK_SIZE * 3)).toEqual([1, 2]);
  });
});

describe('chunkLines', () => {
  it('cuts the sentences into copies of CHUNK_SIZE', () => {
    const all = lines(CHUNK_SIZE + 3);
    expect(chunkLines(all, 0)).toHaveLength(CHUNK_SIZE);
    const second = chunkLines(all, 1);
    expect(second.map((line) => line.source)).toEqual([
      `s${CHUNK_SIZE}`,
      `s${CHUNK_SIZE + 1}`,
      `s${CHUNK_SIZE + 2}`,
    ]);
    expect(second[0]).not.toBe(all[CHUNK_SIZE]);
  });
});

describe('toCloudSessionDoc', () => {
  it('describes the conversation without its sentences', () => {
    const doc = toCloudSessionDoc(
      {
        endedAt: null,
        pair: { from: 'en', to: 'es' },
        lines: lines(3),
        summary: ['a'],
        glossary: 'g',
        usage: [{ model: 'm', inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 }],
      },
      1000,
    );
    expect(doc).toEqual({
      version: 1,
      startedAt: 1000,
      endedAt: null,
      pair: { from: 'en', to: 'es' },
      glossary: 'g',
      summary: ['a'],
      usage: [{ model: 'm', inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 }],
      lineCount: 3,
      chunkSize: CHUNK_SIZE,
    });
    expect(cloudSessionId(1000)).toBe('1000');
  });

  it('carries the name only once there is one, so a save never erases another', () => {
    const source = {
      endedAt: null,
      pair: { from: 'en', to: 'es' },
      lines: lines(1),
      summary: [],
      glossary: '',
      usage: [],
    };

    expect(toCloudSessionDoc({ ...source, title: ' Budget  review ' }, 1000).title).toBe(
      'Budget review',
    );
    expect(toCloudSessionDoc({ ...source, title: '' }, 1000)).not.toHaveProperty('title');
    expect(toCloudSessionDoc(source, 1000)).not.toHaveProperty('title');
  });

  it('gives the name back with the conversation read from the account', () => {
    const read = fromCloudSession({ startedAt: 1000, title: 'Budget review' }, []);

    expect(read).toMatchObject({ startedAt: 1000, title: 'Budget review', lines: [] });
  });
});
