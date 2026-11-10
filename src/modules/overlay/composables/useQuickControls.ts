import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { SCALE_RANGE, VOICE_VOLUME_RANGE } from '../constants';
import { useOverlayStore } from '../store/useOverlayStore';
import { stepTo } from '../utils/range';

/** One press of − or + on the volume: a tenth of the way, so it is felt at once */
const VOLUME_STEP = 0.1;

export interface QuickControls {
  /** The translated voice: 🔊 turns it on or off, − + make it quieter or louder */
  volumeLabel: ComputedRef<string>;
  canQuieter: ComputedRef<boolean>;
  canLouder: ComputedRef<boolean>;
  quieter: () => void;
  louder: () => void;
  toggleVoice: () => void;
  /** The caption text: Aa − + */
  scaleLabel: ComputedRef<string>;
  canSmaller: ComputedRef<boolean>;
  canBigger: ComputedRef<boolean>;
  smaller: () => void;
  bigger: () => void;
}

/**
 * The quick controls every live screen shares (the floating window, the bar in the page
 * and the phone): volume and text size, both worked the same way with − and +.
 * Turning the volume up while the voice is off turns it on: the user wants to hear it.
 */
export function useQuickControls(): QuickControls {
  const store = useOverlayStore();
  const { t, locale } = useI18n();
  const percent = computed(
    () => new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 0 }),
  );

  function setVolume(delta: number): void {
    store.voiceVolume = stepTo(VOICE_VOLUME_RANGE, store.voiceVolume + delta);
  }

  function setScale(delta: number): void {
    store.scale = stepTo(SCALE_RANGE, store.scale + delta);
  }

  return {
    volumeLabel: computed(() =>
      store.options.voice ? percent.value.format(store.voiceVolume) : t('overlay.quick.off'),
    ),
    canQuieter: computed(() => store.options.voice && store.voiceVolume > VOICE_VOLUME_RANGE.min),
    canLouder: computed(() => !store.options.voice || store.voiceVolume < VOICE_VOLUME_RANGE.max),
    quieter: () => setVolume(-VOLUME_STEP),
    louder: () => {
      if (!store.options.voice) store.toggleOption('voice');
      else setVolume(VOLUME_STEP);
    },
    toggleVoice: () => store.toggleOption('voice'),
    scaleLabel: computed(() => percent.value.format(store.scale)),
    canSmaller: computed(() => store.scale > SCALE_RANGE.min),
    canBigger: computed(() => store.scale < SCALE_RANGE.max),
    smaller: () => setScale(-SCALE_RANGE.step),
    bigger: () => setScale(SCALE_RANGE.step),
  };
}
