// Public API of the session module: the record of the current session, its exports
// (Markdown to read, a session file to open again), its cost and the page that shows a
// finished or saved conversation. Only the current session is kept (no history).

export { useSessionRecord } from './store/useSessionRecord';
export { useSessionViewer } from './store/useSessionViewer';
export { useSessionCost } from './composables/useSessionCost';
export { downloadSessionFile, useExportSession } from './composables/useExportSession';
export {
  audioSentSeconds,
  costByModel,
  costUsd,
  hasUnpricedUsage,
  perHourUsd,
} from './utils/costUsd';
export { downloadSubtitles } from './composables/useExportSession';
export { formatEur, usdToEur } from './utils/formatCost';
export { SESSION_FILE_EXTENSION } from './utils/sessionFile';
export { elapsed, sessionDuration } from './utils/toMarkdown';
export { downloadText } from './utils/download';
export { default as SessionView } from './components/SessionView/SessionView.vue';
export { default as SessionShelf } from './components/SessionShelf/SessionShelf.vue';
export type * from './types';
