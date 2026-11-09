import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { createGrants } from './grants.ts';
import { createDemoHandler } from './handler.ts';

/** A key from an OpenAI project kept for the demo, with its own monthly budget */
const OPENAI_DEMO_KEY = defineSecret('OPENAI_DEMO_KEY');

const DEMO_SECONDS = 180;

const handler = createDemoHandler({
  grants: createGrants({
    perClient: 3,
    perDay: 300,
    // About one sentence a second for the whole demo, which nobody speaks
    callsPerGrant: 240,
    // The demo, plus the last translations and the summary after it ends
    grantSeconds: DEMO_SECONDS + 120,
  }),
  openAiKey: () => OPENAI_DEMO_KEY.value(),
  demoSeconds: DEMO_SECONDS,
  log: (message, detail) => logger.error(message, detail),
});

/**
 * The free three-minute demo, reached through Firebase Hosting (same origin as the app).
 * One instance on purpose: the demo's counters live in its memory.
 */
export const demo = onRequest(
  {
    region: 'europe-west1',
    maxInstances: 1,
    concurrency: 80,
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [OPENAI_DEMO_KEY],
    invoker: 'public',
  },
  (req, res) => handler(req, res),
);
