<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { installWay, promptInstall } from '@/shared/device';
import { logError } from '@/shared/errors';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';

const DISMISSED_KEY = 'install-hint-dismissed';

/** On a phone: offers to put the app on the home screen, until done or dismissed. */
const { t } = useI18n();
const dismissed = ref(readStorage(DISMISSED_KEY) === '1');
const way = computed(() => (dismissed.value ? null : installWay()));

function dismiss(): void {
  dismissed.value = true;
  writeStorage(DISMISSED_KEY, '1');
}

function install(): void {
  promptInstall()
    .then((accepted) => {
      if (accepted) dismiss();
    })
    .catch((err: unknown) => logError('Installing the app failed', err));
}
</script>

<template>
  <aside v-if="way" class="install" role="note">
    <svg class="install__icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="5.5" y="2.5" width="9" height="15" rx="2" />
      <path d="M10 6v6M7.6 9.6 10 12l2.4-2.4" />
    </svg>
    <p class="install__text">
      <strong>{{ t('start.install.title') }}</strong>
      <span v-if="way === 'ios'">{{ t('start.install.ios') }}</span>
      <span v-else>{{ t('start.install.why') }}</span>
    </p>
    <button
      v-if="way === 'prompt'"
      class="install__go lg-btn lg-btn--primary"
      type="button"
      @click="install"
    >
      {{ t('start.install.button') }}
    </button>
    <button
      class="install__close"
      type="button"
      :aria-label="t('start.install.dismiss')"
      :title="t('start.install.dismiss')"
      @click="dismiss"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  </aside>
</template>

<style scoped lang="scss">
.install {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 12px 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-xs);

  svg {
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }

  &__icon {
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--accent);
  }

  &__text {
    display: grid;
    flex: 1;
    gap: 2px;
    margin: 0;
    font-size: 13px;

    span {
      color: var(--muted);
    }
  }

  &__go {
    flex: none;
  }

  &__close {
    display: grid;
    flex: none;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--subtle);
    cursor: pointer;

    &:hover {
      background: var(--panel-2);
      color: var(--fg);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--shadow-focus);
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }
}
</style>
