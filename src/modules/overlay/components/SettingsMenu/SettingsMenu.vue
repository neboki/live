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

interface MenuSwitch {
  key: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  toggle: () => void;
}

const MODEL_ROLES: readonly ModelRole[] = [
  'transcription',
  'translation',
  'summary',
  'suggestions',
];
/** What can be shown on the bar, besides the captions themselves */
const SHOWN: readonly OverlayOption[] = ['source', 'summary', 'suggestions', 'speakers'];
const EXPORTED_FEEDBACK_MS = 2500;

/**
 * The settings, in three short blocks: what you see, what you hear and the session.
 * During a session (the bar's menu, or the panel beside the floating window) that is
 * all: the technical options (quality, spending limit, glossary, meeting, models) live
 * on the settings page, which shows them too and leaves out what only acts on a
 * running conversation.
 */
const props = defineProps<{
  /** A real session is running: shows its cost */
  live?: boolean;
  /** Shown in the floating window, where the background cannot be see-through */
  popped?: boolean;
  /** On the settings page: the technical options, and nothing of a running conversation */
  page?: boolean;
  /** Only this block, for one tab of the settings page; every block when left out */
  only?: 'see' | 'hear' | 'quality' | 'accuracy';
}>();

/** A block shows unless the menu was asked for another one */
function shows(group: NonNullable<typeof props.only>): boolean {
  return props.only === undefined || props.only === group;
}

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

/** i18n key of an option: about a talk, the suggestions are questions to ask */
function optionKey(option: OverlayOption): string {
  return option === 'suggestions' && store.mode === 'talk' ? 'questions' : option;
}

/** The "see" block, in the order a user looks for them */
const seeSwitches = computed<MenuSwitch[]>(() => {
  const list: MenuSwitch[] = [];
  if (!props.page) {
    list.push({
      key: 'cc',
      label: t('overlay.cc.label'),
      hint: t('overlay.cc.hint'),
      checked: !store.captionsHidden,
      toggle: () => (store.captionsHidden = !store.captionsHidden),
    });
  }
  for (const option of SHOWN) {
    list.push({
      key: option,
      label: t(`overlay.options.${optionKey(option)}.label`),
      hint: t(`overlay.options.${optionKey(option)}.hint`),
      checked: store.options[option],
      toggle: () => store.toggleOption(option),
    });
  }
  if (store.canHearOriginal) {
    list.push({
      key: 'original',
      label: t('overlay.original'),
      hint: t('overlay.originalOn'),
      checked: store.hearOriginal,
      toggle: () => (store.hearOriginal = !store.hearOriginal),
    });
  }
  // Always listed, so it can be found and set before sharing; a session whose share
  // cannot be synced says why instead
  list.push({
    key: 'sync',
    label: t('overlay.sync.label'),
    hint: t(syncUnavailable.value ? 'overlay.sync.unavailable' : 'overlay.sync.hint'),
    checked: store.syncVideo,
    disabled: syncUnavailable.value,
    toggle: () => (store.syncVideo = !store.syncVideo),
  });
  // Only means something while the picture is synced
  if (store.syncVideo && !syncUnavailable.value) {
    list.push({
      key: 'syncWait',
      label: t('overlay.sync.waitLabel'),
      hint: t('overlay.sync.waitHint'),
      checked: store.syncWait,
      toggle: () => (store.syncWait = !store.syncWait),
    });
  }
  return list;
});

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

function flash(flag: typeof exported): void {
  flag.value = true;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => (flag.value = false), EXPORTED_FEEDBACK_MS);
}

function onExport(): void {
  if (exportSession()) flash(exported);
}

function onSave(): void {
  if (downloadSessionFile(record)) flash(saved);
}

onBeforeUnmount(() => clearTimeout(feedbackTimer));
</script>

<template>
  <div class="menu" :class="{ 'menu--page': page }">
    <!-- 👁 See -->
    <section
      v-if="shows('see')"
      class="menu__group menu__group--see"
      :aria-labelledby="`${uid}-see`"
    >
      <h3 :id="`${uid}-see`" class="menu__title">
        <span aria-hidden="true">👁</span> {{ t('overlay.groups.see') }}
      </h3>
      <button
        v-for="item in seeSwitches"
        :key="item.key"
        class="menu__option"
        type="button"
        role="switch"
        :aria-checked="item.checked"
        :disabled="item.disabled"
        @click="item.toggle()"
      >
        <span class="menu__text">
          {{ item.label }}
          <small>{{ item.hint }}</small>
        </span>
        <span class="menu__switch"></span>
      </button>
      <AppearanceControls :popped="popped" :with-size="page" />
    </section>

    <!-- 👂 Hear -->
    <section
      v-if="shows('hear')"
      class="menu__group menu__group--hear"
      :aria-labelledby="`${uid}-hear`"
    >
      <h3 :id="`${uid}-hear`" class="menu__title">
        <span aria-hidden="true">👂</span> {{ t('overlay.groups.hear') }}
      </h3>
      <button
        class="menu__option"
        type="button"
        role="switch"
        :aria-checked="store.options.voice"
        @click="store.toggleOption('voice')"
      >
        <span class="menu__text">
          {{ t('overlay.options.voice.label') }}
          <small>{{ t('overlay.options.voice.hint') }}</small>
        </span>
        <span class="menu__switch"></span>
      </button>
      <SoundControls :live="live" />
      <!-- Open on the settings page, so the voices are seen without looking for them -->
      <details class="menu__section" :open="page">
        <summary class="menu__option">{{ t('overlay.voice.title') }}</summary>
        <div class="menu__fields">
          <VoiceGallery />
          <label v-if="page && settings.tts.engine === 'openai'" class="menu__field">
            {{ t('overlay.voice.model') }}
            <input v-model.trim="settings.tts.model" type="text" spellcheck="false" />
          </label>
        </div>
      </details>
    </section>

    <!-- 📄 Session: only while one can run -->
    <section
      v-if="!page"
      class="menu__group menu__group--session"
      :aria-labelledby="`${uid}-session`"
    >
      <h3 :id="`${uid}-session`" class="menu__title">
        <span aria-hidden="true">📄</span> {{ t('overlay.groups.session') }}
      </h3>
      <p v-if="live" class="menu__cost">
        {{ t('overlay.cost.label', { cost: costLabel }) }}
        <template v-if="rateLabel"> · {{ t('overlay.cost.rate', { rate: rateLabel }) }}</template>
        <small v-if="billedLabel">{{ billedLabel }}</small>
        <small>{{ t('overlay.cost.hint') }}</small>
      </p>
      <StartOver />
      <!-- Changes at once: the session reconnects with the tier's models -->
      <QualityPicker />
      <ListeningPicker />
      <div class="menu__row">
        <button class="menu__link" type="button" :disabled="!canExport" @click="onSave">
          {{ saved ? t('overlay.export.done') : t('overlay.export.file') }}
        </button>
        <button class="menu__link" type="button" :disabled="!canExport" @click="onExport">
          {{ exported ? t('overlay.export.done') : t('overlay.export.label') }}
        </button>
      </div>
      <p class="menu__hint">
        <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>{{ t('overlay.space') }}</kbd>
        {{ t('overlay.shortcut') }}<br />
        <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>E</kbd>
        {{ t('overlay.shortcutExport') }}
      </p>
    </section>

    <!-- The technical options: set once, on the settings page -->
    <template v-else>
      <section v-if="shows('quality')" class="menu__group menu__group--quality">
        <ListeningPicker />
        <QualityPicker />
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
        <button
          v-if="settings.apiKey"
          class="menu__link menu__link--danger menu__forget"
          type="button"
          @click="settings.forgetKey()"
        >
          {{ t('overlay.forgetKey') }}
        </button>
      </section>

      <section
        v-if="shows('accuracy')"
        class="menu__group menu__group--accuracy"
        :aria-labelledby="`${uid}-accuracy`"
      >
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
    </template>
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

  // Under "See" and "Hear" the blocks need no title of their own; on the page they keep it
  &:not(.menu--page) :deep(.look__title),
  &:not(.menu--page) :deep(.sound__title) {
    display: none;
  }

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

    &.menu__forget {
      margin: 4px 8px 0;
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
