<script setup lang="ts">
import {
  CaptionBar,
  useCaptionShortcuts,
  useVoiceOutput,
  useFloatingWindow,
  useOverlayStore,
} from '@/modules/overlay';
import { useI18n } from 'vue-i18n';
import { logError } from '@/shared/errors';
import { PARTNER_SPEAKER, USER_SPEAKER } from '../../pipeline/conversation';
import { useLiveSession } from '../../store/useLiveSession';

/**
 * The live captions while they are in the floating window. Mounted by the app itself,
 * not by a view: the window opens before the live page shows (while the user picks what
 * to share) and must never sit there empty. With no window open, the live page shows
 * the bar itself. The keyboard shortcuts live here too, so they work in both windows,
 * and so does the spoken translation: owned once, it goes on from where it was when the
 * bar moves between the page and the window.
 */
const session = useLiveSession();
const floating = useFloatingWindow();
const overlay = useOverlayStore();
const { t } = useI18n();
useCaptionShortcuts();
// Stopping silences the voice at once, even while the last line is still being translated
// In a conversation each line is read to the other person, in their language, if they
// asked to hear it; elsewhere the "voice" option decides
const talking = (): boolean => session.mode === 'talk' && session.partner !== '';
useVoiceOutput(
  (speaker) => {
    if (talking() && speaker === USER_SPEAKER) return session.partner;
    return overlay.pair.to.toLowerCase();
  },
  () => session.active,
  (speaker) => {
    if (!talking()) return overlay.options.voice;
    if (speaker === USER_SPEAKER) return session.receive.partner === 'hear';
    if (speaker === PARTNER_SPEAKER) return session.receive.user === 'hear';
    return false;
  },
);

/** From the error's Restart button: a click in the floating window counts for the page. */
function restart(): void {
  session.start().catch((err: unknown) => logError('Restart failed', err));
}
</script>

<template>
  <Teleport v-if="floating.body" :to="floating.body">
    <CaptionBar
      v-show="!overlay.hidden"
      popped
      stoppable
      :live="session.active"
      :error="session.liveError"
      :waiting-key="session.starting ? session.startingKey : 'overlay.waiting'"
      @stop="session.stop()"
      @pop-in="session.popIn()"
      @restart="restart"
      @dismiss-error="session.dismissError()"
    />
    <p v-if="overlay.hidden" class="captions__hidden">
      {{ t('overlay.hiddenHint') }}
      <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>{{ t('overlay.space') }}</kbd>
    </p>
  </Teleport>
</template>

<style scoped lang="scss">
// The caption bar brings its own styles; the window's body is styled by .pip-body (global)
.captions__hidden {
  margin: 0;
  padding: 14px 16px;
  color: var(--muted);
  font: 400 12.5px var(--font-ui);
  text-align: center;

  kbd {
    padding: 1px 5px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-xs);
    font: 500 11px var(--font-mono);
  }
}
</style>
