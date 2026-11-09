// Public API of the account module: optional sign-in with Google (Firebase Auth), and
// keeping conversations in the account (Firestore) once the user turns it on.

export { useAccount, type AccountUser } from './store/useAccount';
export { useCloudSave, type CloudSaveStatus } from './store/useCloudSave';
export { ACCOUNTS_ENABLED } from './firebase';
export { default as AccountCard } from './components/AccountCard/AccountCard.vue';
