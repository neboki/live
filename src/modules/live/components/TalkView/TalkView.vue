<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOverlayStore } from '@/modules/overlay';
import { useSessionRecord } from '@/modules/session';
import { languageLabel } from '@/modules/settings';
import { PARTNER_SPEAKER, USER_SPEAKER } from '../../pipeline/conversation';
import { type Receive, useLiveSession } from '../../store/useLiveSession';

/**
 * Two people, two languages, one phone on the table. The screen is split: the top half
 * faces the other person (turned upside down), the bottom half the user. Each half shows,
 * in its reader's language, what the other one just said (or what they said themselves,
 * dimmed, until the other answers). Nobody takes turns: the language heard says who spoke.
 * Each half has one button for what its reader gets: read, read and hear, or nothing.
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

const RECEIVE_ORDER: readonly Receive[] = ['read', 'hear', 'none'];

const emit = defineEmits<{ stop: [] }>();
const session = useLiveSession();
const overlay = useOverlayStore();
const record = useSessionRecord();
const { t, locale } = useI18n();

const userCode = computed(() => overlay.pair.to.toLowerCase());

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
  const last = record.lines.at(-1);
  if (!last) return { who, code, text: '', own: false, live: false };
  if (last.speaker === who) return { who, code, text: last.source, own: true, live: false };
  return { who, code, text: last.translation || last.source, own: false, live: false };
}

const halves = computed(() => ({
  partner: halfFor(PARTNER_SPEAKER, session.partner),
  user: halfFor(USER_SPEAKER, userCode.value),
}));

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

const RECEIVE_ICON: Readonly<Record<Receive, string>> = { read: '👁', hear: '🎧', none: '✕' };

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
  <main class="talk" :style="{ '--text-scale': String(overlay.scale) }">
    <section
      v-for="half in [halves.partner, halves.user]"
      :key="half.who"
      class="talk__half"
      :class="{ 'talk__half--them': half.who === PARTNER_SPEAKER }"
      :lang="half.code"
      aria-live="polite"
    >
      <p class="talk__text" :class="{ 'talk__text--own': half.own, 'talk__text--live': half.live }">
        {{ half.text || (half.who === USER_SPEAKER ? t('mobile.placeTip') : '…') }}
      </p>
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
      <span v-else-if="overlay.notice" class="talk__notice">{{ t(overlay.notice) }}</span>
      <button class="talk__stop" type="button" @click="emit('stop')">{{ t('mobile.stop') }}</button>
    </div>
  </main>
</template>

<style scoped lang="scss">
.talk {
  --text-scale: 1;

  display: grid;
  grid-template-rows: 1fr auto 1fr;
  gap: 8px;
  height: calc(100dvh - 64px);
  padding: 10px 12px;
  background: var(--bg);

  // The top half belongs to the person across the table
  &__half {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 10px;
    min-height: 0;
    padding: 16px;
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

  &__text {
    align-self: center;
    margin: 0;
    overflow-y: auto;
    font-size: calc(26px * var(--text-scale));
    font-weight: 700;
    line-height: 1.25;
  }

  &__text--own {
    color: var(--muted);
    font-size: calc(18px * var(--text-scale));
    font-weight: 500;
  }

  &__receive {
    justify-self: start;
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
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
  }

  &__dot {
    --level: 0;

    width: 14px;
    height: 14px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--success);
    transform: scale(calc(1 + var(--level) * 0.8));
  }

  &__notice,
  &__error {
    flex: 1;
    font-size: 14px;
  }

  &__error {
    color: var(--danger);
  }

  &__stop {
    min-width: 120px;
    min-height: 52px;
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--danger);
    color: #fff;
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
  }

  &__receive:focus-visible,
  &__stop:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
}
</style>
