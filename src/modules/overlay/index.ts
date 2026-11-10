// Public API of the overlay module: the caption bar (in the page or the floating window),
// its stores, its settings menu and the small UI helpers other modules reuse.

export { useOverlayStore } from './store/useOverlayStore';
export { useFloatingWindow } from './store/useFloatingWindow';
export { useCaptionShortcuts } from './composables/useCaptionShortcuts';
export { useVoiceOutput } from './composables/useVoiceOutput';
export { useDismiss } from './composables/useDismiss';
export { onRadioKeydown } from './composables/radioGroup';
export {
  CAPTION_PLACEMENTS,
  NEAR_SPEND_LIMIT,
  SCALE_RANGE,
  SYNC_DELAY_AUTO,
  SYNC_DELAY_CHOICES,
} from './constants';
export { useQuickControls } from './composables/useQuickControls';
export { default as CaptionBar } from './components/CaptionBar/CaptionBar.vue';
export { default as ListeningBadge } from './components/ListeningBadge/ListeningBadge.vue';
export { default as SettingsMenu } from './components/SettingsMenu/SettingsMenu.vue';
export { default as SettingsPanel } from './components/SettingsPanel/SettingsPanel.vue';
export type * from './types';
