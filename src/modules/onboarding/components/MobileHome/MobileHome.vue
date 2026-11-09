<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { playVoiceNote, prepareVoiceNote, useLiveSession } from '@/modules/live';
import { useOverlayStore } from '@/modules/overlay';
import {
  LanguageSelect,
  languageLabel,
  ORIGINAL_LANGUAGE,
  TARGET_LANGUAGES,
  useSettingsStore,
} from '@/modules/settings';
import { logError } from '@/shared/errors';
import { PRIVACY_PATH } from '@/shared/links';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import ApiKeyField from '../ApiKeyField/ApiKeyField.vue';
import InstallHint from '../InstallHint/InstallHint.vue';

/**
 * The phone's start screen: the user's language and three big buttons, one per situation
 * (listen, talk, present), plus a voice note. Talking and presenting ask one thing first:
 * the other person's language, or the room's. Without a key, a single step asks for it.
 */
type Asking = 'talk' | 'present' | null;

const PARTNER_KEY = 'neboki.mobile.partner';
const ROOM_KEY = 'neboki.mobile.room';

const settings = useSettingsStore();
const session = useLiveSession();
const overlay = useOverlayStore();
const { t, locale } = useI18n();
const emit = defineEmits<{ privacy: [] }>();

const asking = ref<Asking>(null);
const audioFailed = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const mine = computed(() =>
  settings.targetLanguage === ORIGINAL_LANGUAGE ? 'en' : settings.targetLanguage,
);
/** Someone else's language: never the user's own by default */
function otherThan(code: string, remembered: string | null): string {
  if (
    remembered &&
    remembered !== code &&
    (TARGET_LANGUAGES as readonly string[]).includes(remembered)
  )
    return remembered;
  return code === 'en' ? 'es' : 'en';
}
const partner = ref(otherThan(mine.value, readStorage(PARTNER_KEY)));
const room = ref(otherThan(mine.value, readStorage(ROOM_KEY)));
const ready = computed(() => settings.keyLooksValid && !session.starting);
/** The other side's languages: never the user's own, which would leave nothing to translate */
const options = computed(() =>
  TARGET_LANGUAGES.filter((code) => code !== mine.value).map((code) => ({
    code,
    label: languageLabel(code, locale.value),
  })),
);
// The user switched to the other side's language: the other side moves off it
watch(mine, (code) => {
  if (partner.value === code) partner.value = otherThan(code, null);
  if (room.value === code) room.value = otherThan(code, null);
});

function openPrivacy(event: MouseEvent): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  emit('privacy');
}

function run(starting: Promise<unknown>): void {
  starting.catch((err: unknown) => logError('Could not start from the phone home', err));
}

/** Others talk: translated into the user's language, spoken as they talk if voice is on */
function listen(): void {
  run(session.start(settings.targetLanguage, { mode: 'listen', interpret: overlay.options.voice }));
}

function startTalk(): void {
  writeStorage(PARTNER_KEY, partner.value);
  asking.value = null;
  run(session.start(mine.value, { mode: 'talk', partner: partner.value }));
}

function startPresent(): void {
  writeStorage(ROOM_KEY, room.value);
  asking.value = null;
  run(session.start(room.value, { mode: 'present', interpret: overlay.options.voice }));
}

function pickAudio(): void {
  audioFailed.value = false;
  prepareVoiceNote();
  fileInput.value?.click();
}

async function onAudio(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  audioFailed.value = !(await playVoiceNote(file, settings.targetLanguage));
}
</script>

<template>
  <main class="home">
    <InstallHint />

    <section v-if="!settings.keyLooksValid" class="home__setup lg-card">
      <h1 class="home__setup-title">{{ t('mobile.setup.title') }}</h1>
      <p class="home__text">{{ t('mobile.setup.text') }}</p>
      <ApiKeyField />
    </section>

    <section class="home__lang">
      <LanguageSelect prominent />
    </section>

    <div class="home__modes">
      <button class="home__mode home__mode--main" type="button" :disabled="!ready" @click="listen">
        <strong>{{ t('mobile.listen.title') }}</strong>
        <span>{{ t('mobile.listen.hint') }}</span>
      </button>

      <button
        class="home__mode"
        type="button"
        :disabled="!ready"
        :aria-expanded="asking === 'talk'"
        @click="asking = asking === 'talk' ? null : 'talk'"
      >
        <strong>{{ t('mobile.talk.title') }}</strong>
        <span>{{ t('mobile.talk.hint') }}</span>
      </button>
      <div v-if="asking === 'talk'" class="home__ask">
        <label class="home__label" for="home-partner">{{ t('mobile.partnerLanguage') }}</label>
        <select id="home-partner" v-model="partner" class="home__select">
          <option v-for="option in options" :key="option.code" :value="option.code">
            {{ option.label }}
          </option>
        </select>
        <p class="home__text">{{ t('mobile.placeTip') }}</p>
        <div class="home__row">
          <button class="lg-btn" type="button" @click="asking = null">
            {{ t('mobile.cancel') }}
          </button>
          <button class="lg-btn lg-btn--primary" type="button" @click="startTalk">
            {{ t('mobile.start') }}
          </button>
        </div>
      </div>

      <button
        class="home__mode"
        type="button"
        :disabled="!ready"
        :aria-expanded="asking === 'present'"
        @click="asking = asking === 'present' ? null : 'present'"
      >
        <strong>{{ t('mobile.present.title') }}</strong>
        <span>{{ t('mobile.present.hint') }}</span>
      </button>
      <div v-if="asking === 'present'" class="home__ask">
        <label class="home__label" for="home-room">{{ t('mobile.roomLanguage') }}</label>
        <select id="home-room" v-model="room" class="home__select">
          <option v-for="option in options" :key="option.code" :value="option.code">
            {{ option.label }}
          </option>
        </select>
        <p class="home__text">{{ t('mobile.presentTip') }}</p>
        <div class="home__row">
          <button class="lg-btn" type="button" @click="asking = null">
            {{ t('mobile.cancel') }}
          </button>
          <button class="lg-btn lg-btn--primary" type="button" @click="startPresent">
            {{ t('mobile.start') }}
          </button>
        </div>
      </div>

      <button class="home__audio" type="button" :disabled="!ready" @click="pickAudio">
        <strong>{{ t('mobile.audio.title') }}</strong>
        <span>{{ t('mobile.audio.hint') }}</span>
      </button>
      <input
        ref="fileInput"
        class="home__file"
        type="file"
        accept="audio/*,.opus,.ogg,.m4a,.mp3,.wav,.aac"
        tabindex="-1"
        aria-hidden="true"
        @change="onAudio"
      />
    </div>

    <p v-if="session.starting" class="home__status" role="status">{{ t(session.startingKey) }}</p>
    <p v-else-if="audioFailed" class="home__error" role="alert">{{ t('mobile.audio.failed') }}</p>
    <p v-else-if="session.errorKey" class="home__error" role="alert">{{ t(session.errorKey) }}</p>

    <p class="home__consent">
      {{ t('onboarding.consent.text') }}
      <a :href="PRIVACY_PATH" @click="openPrivacy">{{ t('onboarding.consent.link') }}</a>
    </p>
  </main>
</template>

<style scoped lang="scss">
.home {
  display: grid;
  gap: 18px;
  max-width: 560px;
  margin: 0 auto;
  padding: 18px 16px 32px;

  &__setup {
    display: grid;
    gap: 10px;
  }

  &__setup-title {
    margin: 0;
    font-size: 22px;
  }

  &__lang,
  &__ask {
    display: grid;
    gap: 8px;
  }

  &__label {
    color: var(--muted);
    font-size: 15px;
    font-weight: 600;
  }

  &__text {
    margin: 0;
    color: var(--muted);
    font-size: 16px;
    line-height: 1.45;
  }

  &__modes {
    display: grid;
    gap: 12px;
  }

  // Big, thumb-sized cards: the whole card is the button
  &__mode,
  &__audio {
    display: grid;
    gap: 4px;
    min-height: 96px;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--panel);
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;

    strong {
      font-size: 24px;
      line-height: 1.15;
    }

    span {
      color: var(--muted);
      font-size: 16px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
  }

  &__mode--main {
    min-height: 120px;
    border-color: transparent;
    background: var(--brand-gradient);
    color: #fff;

    span {
      color: rgb(255 255 255 / 90%);
    }
  }

  &__audio {
    min-height: 72px;
    border-style: dashed;

    strong {
      font-size: 18px;
    }
  }

  &__ask {
    padding: 16px;
    border-radius: var(--radius-lg);
    background: var(--hover);
  }

  &__select {
    min-height: 52px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--panel);
    color: var(--fg);
    font-size: 18px;
  }

  &__row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;

    .lg-btn {
      min-height: 52px;
      font-size: 17px;
    }
  }

  &__file {
    display: none;
  }

  &__status,
  &__error,
  &__consent {
    margin: 0;
    font-size: 15px;
  }

  &__status {
    color: var(--muted);
  }

  &__error {
    color: var(--danger);
  }

  &__consent {
    color: var(--subtle);
    font-size: 13px;
  }
}
</style>
