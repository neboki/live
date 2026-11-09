<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/modules/settings';
import {
  AUDIO_SOURCES,
  canShareScreen,
  canUseMic,
  needsShare,
  usesMic,
  type AudioSource,
} from '@/shared/audio/audioSources';
import { logError } from '@/shared/errors';
import { useMicrophones } from '../../composables/useMicrophones';

interface SourceOption {
  value: AudioSource;
  disabled: boolean;
}

/**
 * What the session listens to: a shared tab (a call, a video), the microphone (a room,
 * an interview, an event), or both (a hybrid meeting). Picks the microphone too.
 */
defineProps<{
  disabled?: boolean;
}>();

const settings = useSettingsStore();
const { t } = useI18n();
const mics = useMicrophones();
const { named, revealing } = mics;
const share = canShareScreen();
const mic = canUseMic();

const options = computed<SourceOption[]>(() =>
  AUDIO_SOURCES.map((value) => ({
    value,
    disabled: (needsShare(value) && !share) || (usesMic(value) && !mic),
  })),
);
const showMic = computed(() => usesMic(settings.audioSource));
/** Unnamed devices read "Microphone 1", "Microphone 2"… until the page is allowed */
const micOptions = computed(() =>
  mics.devices.value.map((device, index) => ({
    id: device.deviceId,
    label: device.label || t('start.source.micNumber', { n: index + 1 }),
  })),
);

function revealNames(): void {
  mics.reveal().catch((err: unknown) => logError('Revealing the microphones failed', err));
}
</script>

<template>
  <fieldset class="source lg-choice" :disabled="disabled">
    <legend class="lg-choice__label">{{ t('start.source.heading') }}</legend>

    <div class="lg-choice__options">
      <label
        v-for="option in options"
        :key="option.value"
        class="lg-choice__option"
        :class="{
          'lg-choice__option--on': settings.audioSource === option.value,
          'lg-choice__option--off': option.disabled,
        }"
      >
        <input
          v-model="settings.audioSource"
          class="lg-choice__radio"
          type="radio"
          name="audio-source"
          :value="option.value"
          :disabled="option.disabled"
        />
        <svg class="lg-choice__icon" viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="option.value === 'tab'">
            <rect x="3" y="4.5" width="18" height="13" rx="2" />
            <path d="M8 20.5h8M3 8.5h18" />
          </template>
          <template v-else-if="option.value === 'mic'">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.5" />
          </template>
          <template v-else>
            <rect x="2.5" y="5" width="12" height="9" rx="1.5" />
            <rect x="16" y="8" width="5" height="8" rx="2.5" />
            <path d="M18.5 18.5v2M6 18h5" />
          </template>
        </svg>
        <span class="lg-choice__name">{{ t(`start.source.${option.value}.name`) }}</span>
        <span class="lg-choice__for">{{ t(`start.source.${option.value}.for`) }}</span>
      </label>
    </div>

    <div v-if="showMic" class="source__mic">
      <label class="source__device">
        <span class="source__device-label">{{ t('start.source.micLabel') }}</span>
        <select v-model="settings.micDeviceId" class="source__select">
          <option value="">{{ t('start.source.micDefault') }}</option>
          <option v-for="device in micOptions" :key="device.id" :value="device.id">
            {{ device.label }}
          </option>
        </select>
      </label>
      <button
        v-if="micOptions.length > 0 && !named"
        class="source__reveal lg-btn lg-btn--quiet"
        type="button"
        :disabled="revealing"
        @click="revealNames"
      >
        {{ t('start.source.reveal') }}
      </button>
    </div>

    <p class="lg-choice__hint">{{ t(`start.source.${settings.audioSource}.hint`) }}</p>
  </fieldset>
</template>

<style scoped lang="scss">
// The shared choice cards (lg-choice), three across, plus the microphone row under them
.source {
  --lg-choice-columns: 3;

  &__mic {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
  }

  &__device {
    display: grid;
    flex: 1;
    gap: 4px;
    min-width: 0;
  }

  &__device-label {
    color: var(--muted);
    font-size: 12.5px;
  }

  &__select {
    width: 100%;
    height: 38px;
    padding: 0 10px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    font-size: 13.5px;

    &:focus {
      border-color: var(--accent);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &__reveal {
    height: 38px;
  }
}
</style>
