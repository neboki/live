// Phones only let a page make sound from inside a tap. The translated voice starts seconds
// after Start was pressed (when the first sentence is ready), so both voice engines are
// woken up during the tap itself: the Web Audio output and the browser's speech synthesis.

import { unlockAudioOutput } from './pcmPlayer';

/** Call synchronously from a click or tap handler, before anything is awaited. */
export function unlockAudio(): void {
  unlockAudioOutput();
  try {
    const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    // iOS lets speech synthesis speak later only once it has spoken during a gesture
    const silent = new SpeechSynthesisUtterance(' ');
    silent.volume = 0;
    synth.speak(silent);
  } catch (err) {
    console.warn('[Neboki Live] Could not wake the speech synthesis', err);
  }
}
