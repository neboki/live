// What this build offers that changes the privacy page. Kept apart from the account
// module so the page compiles in builds without it.

const env = import.meta.env;

/** Whether this build can sign people in: the same rule as the account module's Firebase config */
export const ACCOUNTS_ENABLED = Boolean(
  env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID,
);
