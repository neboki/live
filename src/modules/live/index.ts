// Public API of the live module: the live page, the captions shown while a conversation
// runs and the store that starts and stops it (audio capture → transcription → translation).

export { default as LiveCaptions } from './components/LiveCaptions/LiveCaptions.vue';
export { default as LiveView } from './components/LiveView/LiveView.vue';
export { useLiveSession } from './store/useLiveSession';
export { default as MobileLiveView } from './components/MobileLiveView/MobileLiveView.vue';
export { playVoiceNote, prepareVoiceNote, stopVoiceNote } from './composables/voiceNote';
export type { LiveMode, Receive } from './store/useLiveSession';
