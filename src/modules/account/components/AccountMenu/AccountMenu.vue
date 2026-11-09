<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount } from '../../store/useAccount';

/**
 * The account at the top right, as in Google's apps: signed in, a round photo that opens
 * a card with the name, the email, a way to the account settings and signing out;
 * signed out, a "Sign in" button.
 */
const emit = defineEmits<{ manage: [] }>();
const { t } = useI18n();
const account = useAccount();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const firstItem = ref<HTMLButtonElement | null>(null);
/** A photo that fails to load falls back to the initial */
const photoFailed = ref(false);

const initial = computed(() => (account.user?.name.trim()[0] ?? '?').toUpperCase());
const showPhoto = computed(() => Boolean(account.user?.photoUrl) && !photoFailed.value);

function close(focusBack = false): void {
  if (!open.value) return;
  open.value = false;
  if (focusBack) trigger.value?.focus();
}

function manage(): void {
  close();
  emit('manage');
}

async function signOut(): Promise<void> {
  close();
  await account.signOut();
}

function onDocumentPointer(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open.value) close(true);
}

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  firstItem.value?.focus();
});
watch(
  () => account.user?.photoUrl,
  () => (photoFailed.value = false),
);
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer);
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div v-if="account.enabled && account.ready" ref="root" class="acct">
    <template v-if="account.user">
      <button
        ref="trigger"
        class="acct__avatar-btn"
        type="button"
        :aria-label="t('account.menu', { name: account.user.name })"
        :title="`${account.user.name}\n${account.user.email}`"
        aria-haspopup="true"
        :aria-expanded="open"
        aria-controls="acct-card"
        @click="open = !open"
      >
        <img
          v-if="showPhoto"
          class="acct__avatar"
          :src="account.user.photoUrl ?? undefined"
          alt=""
          referrerpolicy="no-referrer"
          @error="photoFailed = true"
        />
        <span v-else class="acct__avatar acct__avatar--initial" aria-hidden="true">{{
          initial
        }}</span>
      </button>

      <div
        v-show="open"
        id="acct-card"
        class="acct__card"
        role="dialog"
        :aria-label="t('account.title')"
      >
        <p class="acct__email">{{ account.user.email }}</p>
        <img
          v-if="showPhoto"
          class="acct__avatar acct__avatar--big"
          :src="account.user.photoUrl ?? undefined"
          alt=""
          referrerpolicy="no-referrer"
        />
        <span
          v-else
          class="acct__avatar acct__avatar--big acct__avatar--initial"
          aria-hidden="true"
          >{{ initial }}</span
        >
        <p class="acct__hello">{{ t('account.hello', { name: account.user.name }) }}</p>
        <button ref="firstItem" class="acct__manage" type="button" @click="manage">
          {{ t('account.manage') }}
        </button>
        <button class="acct__out" type="button" :disabled="account.busy" @click="signOut">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8 4H5v12h3M12 6.5 15.5 10 12 13.5M15.5 10H8" />
          </svg>
          {{ t('account.signOut') }}
        </button>
      </div>
    </template>

    <button
      v-else
      class="acct__sign-in"
      type="button"
      :disabled="account.busy"
      @click="account.signIn"
    >
      {{ t('account.signInShort') }}
    </button>

    <p v-if="account.errorKey && !account.user" class="acct__error" role="alert">
      {{ t(account.errorKey) }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.acct {
  position: relative;
  display: flex;
  align-items: center;

  &__avatar-btn {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;

    &:hover,
    &[aria-expanded='true'] {
      background: var(--hover);
    }
  }

  &__avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;

    &--initial {
      background: var(--brand-gradient);
      color: #fff;
      font: 600 15px var(--font-ui);
    }

    &--big {
      width: 72px;
      height: 72px;
      font-size: 30px;
    }
  }

  &__card {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    display: grid;
    gap: 10px;
    justify-items: center;
    width: min(320px, calc(100vw - 24px));
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-xl);
    background: var(--panel);
    box-shadow: var(--shadow-lg);
  }

  &__email {
    max-width: 100%;
    margin: 0 0 4px;
    overflow: hidden;
    color: var(--muted);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__hello {
    margin: 0;
    color: var(--fg);
    font-size: 18px;
    font-weight: 500;
    text-align: center;
  }

  &__manage,
  &__sign-in {
    flex: none;
    white-space: nowrap;
    padding: 8px 18px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    background: none;
    color: var(--accent-text);
    font: 500 13.5px var(--font-ui);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--hover);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__out {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin-top: 4px;
    padding: 10px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--panel-2);
    color: var(--fg);
    font: 500 13.5px var(--font-ui);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--hover);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.5;
    }
  }

  &__error {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: max-content;
    max-width: 260px;
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: var(--shadow-lg);
    color: var(--danger);
    font-size: 12px;
  }
}
</style>
