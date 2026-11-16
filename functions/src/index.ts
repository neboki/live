import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { createGrants } from './grants.ts';
import { createFreeHandler } from './handler.ts';
import { CALLS_PER_TICK, GRANT_GRACE_SECONDS } from './plan.ts';
import { createFirestoreUsage } from './usage.ts';

/**
 * A key from an OpenAI project kept for the free plan. Give that project a monthly
 * budget too: it is the hard stop behind the plan's own limits (plan.ts).
 */
const OPENAI_FREE_KEY = defineSecret('OPENAI_FREE_KEY');

const app = initializeApp();

const handler = createFreeHandler({
  grants: createGrants({ graceSeconds: GRANT_GRACE_SECONDS, callsPerTick: CALLS_PER_TICK }),
  usage: createFirestoreUsage(getFirestore(app)),
  verifyUser: (idToken) =>
    getAuth(app)
      .verifyIdToken(idToken)
      .then((decoded) => decoded.uid)
      .catch(() => null),
  openAiKey: () => OPENAI_FREE_KEY.value(),
  log: (message, detail) => logger.error(message, detail),
});

/**
 * The free minutes, reached through Firebase Hosting (same origin as the app).
 * One instance on purpose: the running sessions live in its memory.
 */
export const free = onRequest(
  {
    region: 'europe-west1',
    maxInstances: 1,
    concurrency: 80,
    timeoutSeconds: 60,
    memory: '256MiB',
    secrets: [OPENAI_FREE_KEY],
    invoker: 'public',
  },
  (req, res) => handler(req, res),
);
