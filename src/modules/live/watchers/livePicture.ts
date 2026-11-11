// The shared tab's picture, live, in the page (see OriginalMonitor.picture).
//
// With the captions in the page the user is not looking at the shared tab, so its picture
// shows above them, as it plays now. The synced picture (behind time, in step with the
// captions) takes its place while that option is on; in the floating window the tab
// itself is in view, so nothing is shown. Only a shared browser tab has a picture to give.

import { shallowRef, watch, type ShallowRef } from 'vue';
import type { AudioCapture } from '@/shared/audio/audioCapture';

export interface LivePictureDeps {
  capture: Pick<AudioCapture, 'originalPicture' | 'hideOriginalPicture'>;
  /** True while the live picture should show: a session runs, in the page, not synced */
  wanted: () => boolean;
}

/** The live picture to show, or null; it follows `wanted` on its own */
export function createLivePicture({
  capture,
  wanted,
}: LivePictureDeps): ShallowRef<MediaStream | null> {
  const stream = shallowRef<MediaStream | null>(null);

  watch(wanted, (show) => {
    if (show) {
      stream.value ??= capture.originalPicture();
      return;
    }
    if (stream.value === null) return;
    stream.value = null;
    capture.hideOriginalPicture();
  });

  return stream;
}
