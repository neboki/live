<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount } from '../../store/useAccount';
import { useCloudSave } from '../../store/useCloudSave';

/**
 * The account card of the settings page: sign in with Google, and choose whether
 * conversations are kept in the account. Off by default; without it nothing is sent.
 */
const { t, locale } = useI18n();
const account = useAccount();
const cloud = useCloudSave();

const savedAt = computed(() =>
  cloud.lastSavedAt === null
    ? ''
    : new Intl.DateTimeFormat(locale.value, { timeStyle: 'short' }).format(cloud.lastSavedAt),
);

function onToggle(event: Event): void {
  cloud.setEnabled((event.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="account">
    <template v-if="account.user">
      <p class="account__who">
        <img
          v-if="account.user.photoUrl"
          class="account__avatar"
          :src="account.user.photoUrl"
          alt=""
          referrerpolicy="no-referrer"
        />
        <span>
          {{ account.user.name }}
          <small>{{ account.user.email }}</small>
        </span>
      </p>
      <label class="account__save">
        <input
          class="account__save-box"
          type="checkbox"
          :checked="cloud.enabled"
          @change="onToggle"
        />
        <span>
          {{ t('account.save') }}
          <small>{{ t('account.saveHint') }}</small>
        </span>
      </label>
      <p
        class="account__status"
        :class="{ 'account__status--error': cloud.status === 'error' }"
        :role="cloud.status === 'error' ? 'alert' : 'status'"
      >
        <template v-if="cloud.enabled && cloud.status === 'saving'">{{
          t('account.saving')
        }}</template>
        <template v-else-if="cloud.enabled && cloud.status === 'saved'">{{
          t('account.saved', { time: savedAt })
        }}</template>
        <template v-else-if="cloud.enabled && cloud.status === 'error'">{{
          t('account.saveFailed')
        }}</template>
      </p>
      <div>
        <button class="lg-btn" type="button" :disabled="account.busy" @click="account.signOut">
          {{ t('account.signOut') }}
        </button>
      </div>
    </template>
    <template v-else>
      <p class="account__hint">{{ t('account.hint') }}</p>
      <div>
        <button
          class="lg-btn"
          type="button"
          :disabled="account.busy || !account.ready"
          @click="account.signIn"
        >
          {{ t('account.signIn') }}
        </button>
      </div>
      <p v-if="account.errorKey" class="account__status account__status--error" role="alert">
        {{ t(account.errorKey) }}
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.account {
  display: grid;
  gap: 12px;

  &__hint {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__who {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 0;

    span,
    small {
      display: grid;
    }

    small {
      color: var(--muted);
      font-size: 12px;
    }
  }

  &__avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  &__save {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;

    span {
      display: grid;
      gap: 2px;
    }

    small {
      color: var(--muted);
      font-size: 12px;
    }
  }

  &__save-box {
    width: 15px;
    height: 15px;
    margin: 3px 0 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  &__status {
    min-height: 1.4em;
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;

    &--error {
      color: var(--danger);
    }
  }
}
</style>
