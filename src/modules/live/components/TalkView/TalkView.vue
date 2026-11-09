<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOverlayStore } from '@/modules/overlay';
import { type SessionLine, useSessionRecord } from '@/modules/session';
import { languageLabel } from '@/modules/settings';
import { immersive, toggleImmersive } from '@/shared/device';
import { useFitText } from '../../composables/fitText';
import { useTextScale } from '../../composables/textScale';
import { PARTNER_SPEAKER, sameLanguage, USER_SPEAKER } from '../../pipeline/conversation';
import { type Receive, useLiveSession } from '../../store/useLiveSession';
import FullscreenIcon from '../MobileLiveView/FullscreenIcon.vue';

/**
 * Two people, two languages, one phone on the table. The screen is split: the top half
 * faces the other person (turned upside down), the bottom half the user. Each half shows,
 * in its reader's language, what the other one just said (or what they said themselves,
 * dimmed, until the other answers). Nobody takes turns: the language heard says who spoke.
 * Each half has one button for what its reader gets: read, read and hear, or nothing.
 * A half never shows text in the other language: an untranslated sentence is skipped.
 */
interface Half {
  who: number;
  /** ISO 639-1 code of the language this half is read in */
  code: string;
  text: string;
  /** The text is this reader's own words, not the other's translated */
  own: boolean;
  live: boolean;
}

interface Shown {
  text: string;
  own: boolean;
}

const RECEIVE_ORDER: readonly Receive[] = ['read', 'hear', 'none'];
const RECEIVE_ICON: Readonly<Record<Receive, string>> = { read: '👁', hear: '🎧', none: '✕' };
/** How far back a half looks for the last thing it can show in its language */
const LOOK_BACK = 12;

const emit = defineEmits<{ stop: [] }>();
const session = useLiveSession();
const overlay = useOverlayStore();
const record = useSessionRecord();
const { t, locale } = useI18n();
const { bigger, smaller } = useTextScale();
const boxes = ref<HTMLElement[]>([]);

const userCode = computed(() => overlay.pair.to.toLowerCase());

function isIn(language: string | undefined, code: string): boolean {
  return !!language && sameLanguage(language, code, languageLabel(code, 'en'));
}

/** What a recorded line puts in front of `who`, who reads `code`; null when nothing */
function shownTo(line: SessionLine, who: number, code: string): Shown | null {
  if (line.speaker === who) return { text: line.source, own: true };
  if (line.speaker === USER_SPEAKER || line.speaker === PARTNER_SPEAKER) {
    // The other one spoke: only their words translated (a direction turned off has none)
    return line.translation ? { text: line.translation, own: false } : null;
  }
  // Nobody known: the translator wrote into the user's language, or into the partner's
  // when the sentence was already in the user's
  if (isIn(line.language, code)) return { text: line.source, own: false };
  const translatedInto = isIn(line.language, userCode.value) ? session.partner : userCode.value;
  if (translatedInto === code && line.translation) return { text: line.translation, own: false };
  return null;
}

function halfFor(who: number, code: string): Half {
  const { id, text, done, speaker } = overlay.translation;
  // A translation being written for this reader shows as it comes
  if (
    id > 0 &&
    !done &&
    text.trim() &&
    speaker !== null &&
    speaker !== undefined &&
    speaker !== who
  )
    return { who, code, text, own: false, live: true };
  const recent = record.lines.slice(-LOOK_BACK);
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const line = recent[index];
    const shown = line ? shownTo(line, who, code) : null;
    if (shown?.text.trim()) return { who, code, ...shown, live: false };
  }
  return { who, code, text: '', own: false, live: false };
}

const halves = computed(() => ({
  partner: halfFor(PARTNER_SPEAKER, session.partner),
  user: halfFor(USER_SPEAKER, userCode.value),
}));

useFitText(boxes, () => [
  halves.value.partner.text,
  halves.value.user.text,
  overlay.scale,
  immersive.value,
]);

function receiveOf(who: number): Receive {
  return who === USER_SPEAKER ? session.receive.user : session.receive.partner;
}

/** Read → read and hear → no translation → read */
function cycle(who: number): void {
  const next = RECEIVE_ORDER[(RECEIVE_ORDER.indexOf(receiveOf(who)) + 1) % RECEIVE_ORDER.length];
  if (!next) return;
  if (who === USER_SPEAKER) session.receive.user = next;
  else session.receive.partner = next;
}

/**
 * The user's button says what it does in the app's language; the other person may not
 * read it, so theirs names their language in that language, with an icon for the choice.
 */
function receiveText(half: Half): string {
  const receive = receiveOf(half.who);
  if (half.who === USER_SPEAKER) {
    return `${languageLabel(half.code, locale.value)} · ${t(`mobile.receive.${receive}`)}`;
  }
  return `${languageLabel(half.code, half.code)} · ${RECEIVE_ICON[receive]}`;
}
</script>

<template>
  <main
    class="talk"
    :class="{ 'talk--full': immersive }"
    :style="{ '--text-scale': String(overlay.scale) }"
  >
    <section
      v-for="half in [halves.partner, halves.user]"
      :key="half.who"
      class="talk__half"
      :class="{ 'talk__half--them': half.who === PARTNER_SPEAKER }"
      :lang="half.code"
      aria-live="polite"
    >
      <div
        ref="boxes"
        class="talk__text"
        :class="{ 'talk__text--own': half.own, 'talk__text--live': half.live }"
      >
        <p>{{ half.text || (half.who === USER_SPEAKER ? t('mobile.placeTip') : '…') }}</p>
      </div>
      <button
        class="talk__receive"
        type="button"
        :aria-label="
          t('mobile.receiveLabel', {
            who: half.who === USER_SPEAKER ? t('mobile.you') : t('mobile.them'),
          })
        "
        @click="cycle(half.who)"
      >
        {{ receiveText(half) }}
      </button>
    </section>

    <div class="talk__middle">
      <i class="talk__dot" :style="{ '--level': String(overlay.level) }" aria-hidden="true"></i>
      <span v-if="session.liveError" class="talk__error" role="alert">{{
        t(session.liveError)
      }}</span>
      <span v-else class="talk__notice">{{ overlay.notice ? t(overlay.notice) : '' }}</span>
      <button class="talk__tool" type="button" :aria-label="t('mobile.smaller')" @click="smaller">
        A−
      </button>
      <button class="talk__tool" type="button" :aria-label="t('mobile.bigger')" @click="bigger">
        A+
      </button>
      <button
        class="talk__tool"
        type="button"
        :aria-label="immersive ? t('mobile.exitFullScreen') : t('mobile.fullScreen')"
        :aria-pressed="immersive"
        @click="toggleImmersive"
      >
        <FullscreenIcon :on="immersive" />
      </button>
      <button class="talk__stop" type="button" @click="emit('stop')">{{ t('mobile.stop') }}</button>
    </div>
  </main>
</template>

<style scoped lang="scss">
.talk {
  --text-scale: 1;

  display: grid;
  grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 8px;
  height: calc(100dvh - 52px);
  padding: 10px 12px;
  background: var(--bg);

  // Nothing above it: the halves take the whole display, clear of notches and bars
  &--full {
    height: 100dvh;
    padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }

  // The top half belongs to the person across the table
  &__half {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 10px;
    min-height: 0;
    padding: 14px 16px;
    border-radius: var(--radius-xl);
    background: var(--panel);
    color: var(--fg);

    &:first-child {
      order: 0;
    }

    &:nth-child(2) {
      order: 2;
    }
  }

  &__half--them {
    transform: rotate(180deg);
  }

  // The box keeps its size; the text inside shrinks (--fit) until all of it shows
  &__text {
    --fit: 1;

    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    font-size: calc(26px * var(--text-scale) * var(--fit));
    font-weight: 700;
    line-height: 1.25;
    overflow-wrap: anywhere;

    // Centred while it fits; auto margins never push text out of reach
    p {
      margin: auto 0;
    }
  }

  &__text--own {
    color: var(--muted);
    font-size: calc(20px * var(--text-scale) * var(--fit));
    font-weight: 500;
  }

  &__receive {
    justify-self: start;
    max-width: 100%;
    min-height: 48px;
    padding: 0 16px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: var(--hover);
    color: var(--fg);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  &__middle {
    display: flex;
    order: 1;
    gap: 8px;
    align-items: center;
    min-height: 52px;
  }

  &__dot {
    --level: 0;

    flex: none;
    width: 14px;
    height: 14px;
    margin: 0 4px 0 6px;
    border-radius: 50%;
    background: var(--success);
    transform: scale(calc(1 + var(--level) * 0.8));
  }

  &__notice,
  &__error {
    flex: 1;
    min-width: 0;
    font-size: 14px;
  }

  &__error {
    color: var(--danger);
  }

  &__tool {
    display: grid;
    flex: none;
    place-items: center;
    width: 48px;
    height: 48px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-lg);
    background: var(--panel);
    color: var(--fg);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;

    &[aria-pressed='true'] {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
  }

  &__stop {
    flex: none;
    min-width: 92px;
    min-height: 48px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--danger);
    color: #fff;
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
  }

  &__receive:focus-visible,
  &__tool:focus-visible,
  &__stop:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
}
</style>
