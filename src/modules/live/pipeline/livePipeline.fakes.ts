// Test doubles for the live pipeline specs (no network, no audio).

import { vi, type Mock } from 'vitest';
import type {
  LlmProvider,
  SttCallbacks,
  SttOptions,
  SttProvider,
  SttSession,
} from '@/shared/providers/types';
import type { SessionSink } from './types';

export interface FakeStt extends SttProvider {
  /** Callbacks of the latest connect() */
  callbacks: () => SttCallbacks;
  /** Options of the latest connect() */
  options: () => SttOptions;
  appended: Int16Array[];
  close: Mock<() => void>;
}

export interface FakeSttSetup {
  /** connect() waits for it */
  gate?: Promise<void>;
  /** connect() rejects with it */
  failWith?: unknown;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export type FakeRecord = { [K in keyof SessionSink]: Mock<SessionSink[K]> };

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function fakeStt(setup: FakeSttSetup = {}): FakeStt {
  let callbacks: SttCallbacks | null = null;
  let options: SttOptions | null = null;
  const appended: Int16Array[] = [];
  const close = vi.fn<() => void>();
  return {
    appended,
    close,
    callbacks: () => callbacks as SttCallbacks,
    options: () => options as SttOptions,
    connect: async (next, cb): Promise<SttSession> => {
      callbacks = cb;
      options = next;
      await setup.gate;
      if (setup.failWith !== undefined) throw setup.failWith;
      return { append: (pcm) => appended.push(pcm), close };
    },
  };
}

export function fakeLlm(overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    translate: async (request, onDelta) => {
      onDelta(`[${request.targetLanguage}] `);
      onDelta(request.text);
    },
    summarize: async (request) => [`${request.newLines.length} lines`],
    suggest: async () => [{ mine: 'Sí', theirs: 'Yes' }],
    ...overrides,
  };
}

export function fakeRecord(): FakeRecord {
  return {
    addLine: vi.fn<SessionSink['addLine']>(),
    setSummary: vi.fn<SessionSink['setSummary']>(),
    addUsage: vi.fn<SessionSink['addUsage']>(),
  };
}
