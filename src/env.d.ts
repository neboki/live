/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** Brand a build starts with: "neboki" (default) */
  readonly VITE_DEFAULT_BRAND?: string;
  /** Where the free demo's server answers, e.g. "/api/demo"; unset: no demo */
  readonly VITE_DEMO_API?: string;
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
