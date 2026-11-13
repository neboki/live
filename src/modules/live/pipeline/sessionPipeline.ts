import type { AppError } from '@/shared/errors';
import { INTERPRETER_MODEL, TIER_MODELS } from '@/shared/providers/openai/config';
import { openAiInterpreter } from '@/shared/providers/openai/realtime/realtimeTranslate';
import type { InterpreterProvider } from '@/shared/providers/types';
import { createInterpreterPipeline } from './interpreterPipeline';
import { createLivePipeline } from './livePipeline';
import type { LivePipeline, PipelineDeps, PipelineOptions } from './types';

export interface SessionPipelineDeps extends PipelineDeps {
  interpreter?: InterpreterProvider;
}

/** The interpreter is chosen through its model, and only translates: it needs a target. */
export function usesInterpreter(options: PipelineOptions): boolean {
  return options.models?.translation === INTERPRETER_MODEL && options.targetLanguage !== null;
}

/**
 * Without a language to translate into the interpreter has nothing to do: the session
 * transcribes with the live model instead, keeping the extras' models.
 */
export function withoutInterpreter(options: PipelineOptions): PipelineOptions {
  const models = options.models;
  if (!models) return options;
  const live = TIER_MODELS.medium;
  return {
    ...options,
    models: {
      ...models,
      ...(models.transcription === INTERPRETER_MODEL ? { transcription: live.transcription } : {}),
      ...(models.translation === INTERPRETER_MODEL ? { translation: live.translation } : {}),
    },
  };
}

/**
 * The live session's pipeline: the chained one (transcription, then a text model) or
 * the interpreter, picked at every start from the models in use.
 */
export function createSessionPipeline({
  interpreter = openAiInterpreter,
  ...deps
}: SessionPipelineDeps): LivePipeline {
  const chained = createLivePipeline(deps);
  const interpreting = createInterpreterPipeline({ ...deps, interpreter });
  let active: LivePipeline = chained;

  function start(options: PipelineOptions): Promise<AppError | null> {
    chained.abort();
    interpreting.abort();
    if (usesInterpreter(options)) {
      active = interpreting;
      return interpreting.start(options);
    }
    active = chained;
    return chained.start(withoutInterpreter(options));
  }

  return {
    start,
    pushAudio: (pcm) => active.pushAudio(pcm),
    stop: () => active.stop(),
    abort: () => active.abort(),
    setTargetLanguage: (language, code) => active.setTargetLanguage(language, code),
    resetConversation: () => active.resetConversation(),
    captionComing: () => active.captionComing(),
  };
}
