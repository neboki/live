<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLiveSession } from '@/modules/live';
import { useFloatingWindow } from '@/modules/overlay';
import { LanguageSelect, useSettingsStore } from '@/modules/settings';
import { needsShare } from '@/shared/audio/audioSources';
import { PRIVACY_PATH } from '@/shared/links';
import { hasDemo } from '@/shared/providers/openai/demo';
import ApiKeyField from '../ApiKeyField/ApiKeyField.vue';
import AudioSourcePicker from '../AudioSourcePicker/AudioSourcePicker.vue';
import InstallHint from '../InstallHint/InstallHint.vue';
import PlacementPicker from '../PlacementPicker/PlacementPicker.vue';

/**
 * The app's start screen: language, what to listen to and where the captions go, OpenAI
 * key and Start. Saved conversations live in the sidebar; settings have a page of their own.
 */
const settings = useSettingsStore();
const session = useLiveSession();
const { t } = useI18n();
const emit = defineEmits<{
  /** The privacy page was asked for; the app decides which page shows */
  privacy: [];
}>();

/** A real link (it can open in a new tab), followed inside the app on a plain click */
function openPrivacy(event: MouseEvent): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  emit('privacy');
}
// Without the floating window the captions show in the page, which only suits the
// microphone: a shared tab would be out of sight
const canFloat = useFloatingWindow().isSupported;
const canStart = computed(() => canFloat || !needsShare(settings.audioSource));
// Rather than open on a red notice, such a browser starts on what it can do
if (!canStart.value) settings.audioSource = 'mic';

async function start(): Promise<void> {
  await session.start(settings.targetLanguage, { demo: false });
}

/** The free demo: no key, a few minutes, captions only */
async function startDemo(): Promise<void> {
  await session.start(settings.targetLanguage, { demo: true });
}
</script>

<template>
  <main class="start">
    <header class="lg-head">
      <h1 class="lg-head__title">{{ t('start.title') }}</h1>
    </header>

    <div class="start__content lg-page">
      <InstallHint class="start__install" />
      <section class="start__source lg-card">
        <LanguageSelect prominent />
        <AudioSourcePicker :disabled="session.starting" />
        <PlacementPicker :can-float="canFloat" :disabled="session.starting" />
      </section>

      <section class="start__go lg-card">
        <div class="start__field">
          <h2 class="lg-card__title">
            {{ t(settings.provider === 'azure' ? 'start.keyHeadingAzure' : 'start.keyHeading') }}
          </h2>
          <ApiKeyField>
            <button
              class="start__cta lg-btn lg-btn--primary"
              type="button"
              :disabled="!canStart || !settings.keyLooksValid || session.starting"
              @click="start"
            >
              {{ session.starting ? t(session.startingKey) : t('start.button') }}
            </button>
          </ApiKeyField>
        </div>

        <div v-if="hasDemo" class="start__demo">
          <span class="start__or">{{ t('start.demo.or') }}</span>
          <button
            class="start__cta lg-btn"
            type="button"
            :disabled="!canStart || session.starting"
            @click="startDemo"
          >
            {{ t('start.demo.button') }}
          </button>
          <p class="start__hint">{{ t('start.demo.note') }}</p>
        </div>

        <p v-if="!canStart" class="start__notice" role="alert">{{ t('errors.pipUnsupported') }}</p>
        <p v-else-if="session.errorKey" class="start__notice" role="alert">
          {{ t(session.errorKey) }}
        </p>
        <p v-else-if="session.starting" class="start__hint" role="status">
          {{ t(`start.${settings.audioSource}Hint`) }}
          {{ t(`start.where.hint.${session.wantsFloating ? 'floating' : 'page'}`) }}
        </p>

        <p class="start__consent">
          {{ t('onboarding.consent.text') }}
          <a :href="PRIVACY_PATH" @click="openPrivacy">
            {{ t('onboarding.consent.link') }}
          </a>
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped lang="scss">
.start {
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: clip;

  // A soft coral glow behind the start screen
  &::before {
    position: absolute;
    inset: 0 0 auto;
    z-index: -1;
    height: 520px;
    background: radial-gradient(ellipse 55% 45% at 40% 0%, var(--accent-glow), transparent 70%);
    content: '';
    pointer-events: none;
  }

  // One column on a phone; on wide screens what it listens to beside the key with Start,
  // and the conversations across both below
  &__content {
    display: grid;
    grid-template-areas:
      'install'
      'source'
      'go';
    gap: 20px;
    align-items: start;

    @media (width >= 1200px) {
      grid-template-areas:
        'install install'
        'source go';
      grid-template-columns: minmax(0, 1fr) minmax(360px, 440px);
      gap: 24px;
    }
  }

  &__install {
    grid-area: install;
  }

  &__source {
    grid-area: source;
  }

  &__go {
    grid-area: go;
  }

  &__field {
    display: grid;
    gap: 12px;
  }

  // Under the key input, as wide as the column
  &__cta {
    flex: 1 0 100%;
    height: 46px;
    font-size: 15px;
  }

  // The free demo, under the key: a way in for whoever has none yet
  &__demo {
    display: grid;
    gap: 8px;
  }

  // A rule each side of "or"
  &__or {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--subtle);
    font-size: 12px;

    &::before,
    &::after {
      flex: 1;
      border-top: 1px solid var(--line-soft);
      content: '';
    }
  }

  &__notice,
  &__hint,
  &__consent {
    margin: 0;
    font-size: 13px;
  }

  &__notice {
    color: var(--danger);
  }

  &__hint {
    color: var(--muted);
  }

  &__consent {
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
    color: var(--subtle);
    font-size: 12px;
  }
}
</style>
