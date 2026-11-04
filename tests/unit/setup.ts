// jsdom run in a VM context (pool 'vmThreads') lacks the web streams Node has; the specs
// for SSE, chat streaming and the OpenAI voice read them, so they come from Node here.
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';

const globals = globalThis as Record<string, unknown>;
globals.ReadableStream ??= ReadableStream;
globals.WritableStream ??= WritableStream;
globals.TransformStream ??= TransformStream;
