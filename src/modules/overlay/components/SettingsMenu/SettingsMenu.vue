<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  audioSentSeconds,
  downloadSessionFile,
  formatEur,
  hasUnpricedUsage,
  perHourUsd,
  useExportSession,
  useSessionCost,
  useSessionRecord,
  elapsed,
  sessionDuration,
} from '@/modules/session';
import { toSpendLimit, useSettingsStore, type ModelRole } from '@/modules/settings';
import { OVERLAY_OPTIONS } from '../../constants';
import { useOverlayStore } from '../../store/useOverlayStore';
import type { OverlayOption } from '../../types';
import AppearanceControls from '../AppearanceControls/AppearanceControls.vue';
import GlossaryEditor from '../GlossaryEditor/GlossaryEditor.vue';
import ListeningPicker from '../ListeningPicker/ListeningPicker.vue';
import MeetingEditor from '../MeetingEditor/MeetingEditor.vue';
import QualityPicker from '../QualityPicker/QualityPicker.vue';
import SoundControls from '../SoundControls/SoundControls.vue';
import StartOver from '../StartOver/StartOver.vue';
import VoiceGallery from '../VoiceGallery/VoiceGallery.vue';

const MODEL_ROLES: readonly ModelRole[] = [
  'transcription',
  'translation',
  'summary',
  'suggestions',
];
const EXPORTED_FEEDBACK_MS = 2500;

const props = defineProps<{
  /** A real session is running: shows its cost and the "forget key" action */
  live?: boolean;
  /** Shown in the floating window, where the background cannot be see-through */
  popped?: boolean;
  /** On the settings page: leaves out what only acts on a running conversation */
  page?: boolean;
}>();

const store = useOverlayStore();
const settings = useSettingsStore();
const { t, locale } = useI18n();
const cost = useSessionCost();
const { canExport, exportSession } = useExportSession();
const record = useSessionRecord();
const uid = useId();
const exported = ref(false);
const saved = ref(false);
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;

/** A session is running, but what it shares cannot be played behind time */
const syncUnavailable = computed(() => props.live === true && !store.canSyncVideo);

const unpriced = computed(() => hasUnpricedUsage(record.usage));
const costLabel = computed(() =>
  unpriced.value ? t('overlay.cost.unknown') : formatEur(cost.value, locale.value),
);
/** What an hour would cost at this pace, once the session is old enough to tell */
const rateLabel = computed(() => {
  const rate = perHourUsd(cost.value, sessionDuration(record));
  return rate === null || unpriced.value ? null : formatEur(rate, locale.value);
});
/** Audio actually sent against the time listened: what the silence gate saved */
const billedLabel = computed(() => {
  const sent = audioSentSeconds(record.usage, settings.tts.model);
  if (!sent) return null;
  return t('overlay.cost.billed', {
    sent: elapsed(sent * 1000),
    heard: elapsed(sessionDuration(record)),
  });
});
/** Euros per session; an empty field means no limit */
const spendLimit = computed({
  get: (): string => (settings.spendLimitEur === null ? '' : String(settings.spendLimitEur)),
  set: (value: string | number) => (settings.spendLimitEur = toSpendLimit(value)),
});

/** i18n key of an option: about a talk, the suggestions are questions to ask */
function optionKey(option: OverlayOption): string {
  return option === 'suggestions' && store.mode === 'talk' ? 'questions' : option;
}

function onExport(): void {
  if (!exportSession()) return;
  exported.value = true;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => (exported.value = false), EXPORTED_FEEDBACK_MS);
}

function onSave(): void {
  if (!downloadSessionFile(record)) return;
  saved.value = true;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => (saved.value = false), EXPORTED_FEEDBACK_MS);
}

function forgetKey(): void {
  settings.forgetKey();
}

onBeforeUnmount(() => clearTimeout(feedbackTimer));
</script>

<template>
  <div class="menu" :class="{ 'menu--page': page }">
    <StartOver v-if="!page" />

    <section class="menu__group menu__group--look">
      <AppearanceControls :popped="popped" />
    </section>

    <section class="menu__group menu__group--show" :aria-labelledby="`${uid}-show`">
      <h3 :id="`${uid}-show`" class="menu__title">{{ t('overlay.groups.show') }}</h3>
      <ListeningPicker />
      <button
        v-for="option in OVERLAY_OPTIONS"
        :key="option"
        class="menu__option"
        type="button"
        role="switch"
        :aria-checked="store.options[option]"
        @click="store.toggleOption(option)"
      >
        <span class="menu__text">
          {{ t(`overlay.options.${optionKey(option)}.label`) }}
          <small>{{ t(`overlay.options.${optionKey(option)}.hint`) }}</small>
        </span>
        <span class="menu__switch"></span>
      </button>
      <button
        v-if="store.canHearOriginal"
        class="menu__option"
        type="button"
        role="switch"
        :aria-checked="store.hearOriginal"
        @click="store.hearOriginal = !store.hearOriginal"
      >
        <span class="menu__text">
          {{ t('overlay.original') }}
          <small>{{ t('overlay.originalOn') }}</small>
        </span>
        <span class="menu__switch"></span>
      </button>
      <!-- Always listed, so it can be found and set before sharing; a session whose
           share cannot be synced says why instead -->
      <button
        class="menu__option"
        type="button"
        role="switch"
        :aria-checked="store.syncVideo"
        :disabled="syncUnavailable"
        @click="store.syncVideo = !store.syncVideo"
      >
        <span class="menu__text">
          {{ t('overlay.sync.label') }}
          <small>{{ t(syncUnavailable ? 'overlay.sync.unavailable' : 'overlay.sync.hint') }}</small>
        </span>
        <span class="menu__switch"></span>
      </button>
      <!-- Only means something while the picture is synced -->
      <button
        v-if="store.syncVideo && !syncUnavailable"
        class="menu__option"
        type="button"
        role="switch"
        :aria-checked="store.syncWait"
        @click="store.syncWait = !store.syncWait"
      >
        <span class="menu__text">
          {{ t('overlay.sync.waitLabel') }}
          <small>{{ t('overlay.sync.waitHint') }}</small>
        </span>
        <span class="menu__switch"></span>
      </button>
    </section>

    <section class="menu__group menu__group--sound">
      <SoundControls :live="live" />
      <details class="menu__section">
        <summary class="menu__option">{{ t('overlay.voice.title') }}</summary>
        <div class="menu__fields">
          <VoiceGallery />
          <label v-if="settings.tts.engine === 'openai'" class="menu__field">
            {{ t('overlay.voice.model') }}
            <input v-model.trim="settings.tts.model" type="text" spellcheck="false" />
          </label>
        </div>
      </details>
    </section>

    <section class="menu__group menu__group--quality">
      <QualityPicker />
      <p v-if="live" class="menu__cost">
        {{ t('overlay.cost.label', { cost: costLabel }) }}
        <template v-if="rateLabel"> · {{ t('overlay.cost.rate', { rate: rateLabel }) }}</template>
        <small v-if="billedLabel">{{ billedLabel }}</small>
        <small>{{ t('overlay.cost.hint') }}</small>
      </p>
      <label class="menu__field menu__limit">
        {{ t('overlay.cost.limit') }}
        <input
          v-model.lazy="spendLimit"
          type="number"
          min="0"
          step="0.5"
          inputmode="decimal"
          :placeholder="t('overlay.cost.noLimit')"
        />
        <small>{{ t('overlay.cost.limitHint') }}</small>
      </label>
    </section>

    <section class="menu__group menu__group--accuracy" :aria-labelledby="`${uid}-accuracy`">
      <h3 :id="`${uid}-accuracy`" class="menu__title">{{ t('overlay.groups.accuracy') }}</h3>
      <GlossaryEditor />
      <MeetingEditor />
      <details class="menu__section">
        <summary class="menu__option">{{ t('overlay.models.title') }}</summary>
        <div class="menu__fields">
          <label v-for="role in MODEL_ROLES" :key="role" class="menu__field">
            {{ t(`overlay.models.${role}`) }}
            <input v-model.trim="settings.models[role]" type="text" spellcheck="false" />
          </label>
          <button class="menu__link" type="button" @click="settings.resetModels()">
            {{ t('overlay.models.reset') }}
          </button>
        </div>
      </details>
    </section>

    <section v-if="!page" class="menu__group menu__group--session">
      <div class="menu__row">
        <button class="menu__link" type="button" :disabled="!canExport" @click="onSave">
          {{ saved ? t('overlay.export.done') : t('overlay.export.file') }}
        </button>
        <button class="menu__link" type="button" :disabled="!canExport" @click="onExport">
          {{ exported ? t('overlay.export.done') : t('overlay.export.label') }}
        </button>
        <button v-if="live" class="menu__link menu__link--danger" type="button" @click="forgetKey">
          {{ t('overlay.forgetKey') }}
        </button>
      </div>

      <p class="menu__hint">
        <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>{{ t('overlay.space') }}</kbd>
        {{ t('overlay.shortcut') }}<br />
        <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>E</kbd>
        {{ t('overlay.shortcutExport') }}
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
// Lives in the bar's floating panel, which sets how tall it can get
.menu {
  display: grid;
  flex: 1 1 auto;
  gap: 2px;
  align-content: start;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  cursor: default;

  &__option {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 7px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--glass-fg);
    font: 400 13px var(--font-ui);
    text-align: left;
    cursor: pointer;
    appearance: none;
    transition: background 0.15s;

    &:hover:not(:disabled) {
      background: var(--glass-hover);
    }

    &:disabled {
      cursor: not-allowed;

      .menu__switch {
        opacity: 0.45;
      }
    }

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: 1px;
    }
  }

  &__text {
    flex: 1;
    min-width: 0;

    small {
      display: block;
      color: var(--glass-muted);
      font-size: 11.5px;
    }
  }

  &__switch {
    position: relative;
    flex: none;
    width: 28px;
    height: 16px;
    border-radius: var(--radius-pill);
    background: var(--glass-track);
    transition: background 0.2s;

    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.35s var(--ease-spring);
    }
  }

  &__option[aria-checked='true'] &__switch {
    background: var(--glass-accent);

    &::after {
      transform: translateX(12px);
    }
  }

  &__section > summary {
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &::after {
      content: '›';
      margin-left: auto;
      color: var(--glass-muted);
      font-size: 12px;
      transition: transform 0.25s var(--ease-spring);
    }
  }

  &__section[open] > summary::after {
    transform: rotate(90deg);
  }

  &__fields {
    display: grid;
    gap: 6px;
    padding: 2px 8px 8px;
  }

  &__field {
    display: grid;
    gap: 2px;
    color: var(--glass-muted);
    font-size: 11.5px;

    input,
    select {
      width: 100%;
      padding: 5px 8px;
      border: 1px solid var(--glass-line);
      border-radius: var(--radius-sm);
      background: var(--glass-field);
      color: var(--glass-fg);
      font: 400 12.5px var(--font-mono);
    }
  }

  // Each group is a block of its own: a line between them in the bar, a card on the page
  &__group {
    display: grid;
    gap: 2px;
    align-content: start;
    min-width: 0;

    & + & {
      margin-top: 4px;
      padding-top: 6px;
      border-top: 1px solid var(--glass-line);
    }
  }

  &__title {
    margin: 0;
    padding: 7px 8px 4px;
    color: var(--glass-muted);
    font: 600 10.5px var(--font-ui);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  &__cost {
    margin: 0;
    padding: 4px 8px;
    color: var(--glass-fg);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;

    small {
      display: block;
      color: var(--glass-muted);
      font-size: 11px;
    }
  }

  &__limit {
    padding: 4px 8px;

    input {
      max-width: 120px;
    }

    small {
      font-size: 11px;
    }
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    justify-content: space-between;
    padding: 2px 8px;
  }

  &__link {
    justify-self: start;
    padding: 2px 0;
    border: 0;
    background: none;
    color: var(--glass-accent);
    font: 500 12.5px var(--font-ui);
    cursor: pointer;

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &:focus-visible {
      outline: 2px solid var(--glass-accent);
      outline-offset: 1px;
    }

    &--danger {
      color: #f87171;
    }
  }

  &__hint {
    margin: 0;
    padding: 4px 8px 2px;
    color: var(--glass-muted);
    font-family: var(--font-mono);
    font-size: 10.5px;

    // Keyboard shortcuts mean nothing on a touch-only phone or tablet
    @media (hover: none) and (pointer: coarse) {
      display: none;
    }

    kbd {
      padding: 0 4px;
      border: 1px solid var(--glass-line);
      border-radius: var(--radius-xs);
      font: inherit;
    }
  }
}
</style>
