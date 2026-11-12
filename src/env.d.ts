/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** Brand a build starts with: "neboki" (default) */
  readonly VITE_DEFAULT_BRAND?: string;
  /** Where the free minutes server answers, e.g. "/api/free"; unset: no free minutes */
  readonly VITE_FREE_API?: string;
  /** Firebase web app for sign-in with Google; unset: no accounts */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

/**
 * Screen Capture's CaptureController (Chromium 109+), not yet in TypeScript's DOM
 * library: it lets the page that shares a tab stay in front.
 */
type CaptureStartFocusBehavior =
  'focus-capturing-application' | 'focus-captured-surface' | 'no-focus-change';

declare class CaptureController {
  setFocusBehavior(focusBehavior: CaptureStartFocusBehavior): void;
}

interface DisplayMediaStreamOptions {
  controller?: CaptureController;
}
