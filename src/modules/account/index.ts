// Public API of the account module: optional sign-in with Google (Firebase Auth), keeping
// conversations in the account (Firestore) once the user turns it on, and the history of
// those conversations: open, delete one, delete all, delete the account.

export { useAccount, type AccountUser } from './store/useAccount';
export { useCloudSave, type CloudSaveStatus } from './store/useCloudSave';
export { useCloudHistory, HISTORY_LIMIT } from './store/useCloudHistory';
export { useCloudBrand, type CloudBrandStatus } from './store/useCloudBrand';
export {
  useCloudPrefs,
  type CloudPrefsOptions,
  type CloudPrefsStatus,
} from './store/useCloudPrefs';
export type { CloudHistoryItem } from './utils/cloudSession';
export { ACCOUNTS_ENABLED } from './firebase';
export { default as AccountCard } from './components/AccountCard/AccountCard.vue';
export { default as AccountMenu } from './components/AccountMenu/AccountMenu.vue';
export { default as CloudSessionActions } from './components/CloudSessionActions/CloudSessionActions.vue';
