<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount } from '@/modules/account';
import { useLiveSession } from '@/modules/live';
import { logError } from '@/shared/errors';
import {
  type FreeBalance,
  fetchFreeBalance,
  hasFreeServer,
} from '@/shared/providers/openai/freePlan';

/**
 * The free minutes, under the key: a way in for whoever has none yet. Signed out it offers
 * the Google sign-in; signed in it tells the minutes left this month and starts with them.
 */
const props = defineProps<{
  /** The browser cannot start what was chosen; the parent says why */
  disabled: boolean;
}>();
const emit = defineEmits<{
  /** Start a free session; the parent calls it from this click */
  start: [];
}>();

const { t } = useI18n();
const account = useAccount();
const session = useLiveSession();

const shown = hasFreeServer && account.enabled;
const balance = ref<FreeBalance | null>(null);
/** i18n key of why the balance could not be read */
const balanceError = ref<string | null>(null);

const minutesLeft = computed(() => Math.floor((balance.value?.seconds ?? 0) / 60));
const canUse = computed(
  () => balance.value !== null && balance.value.available && minutesLeft.value > 0,
);

/** What the line under the button says */
const status = computed((): string => {
  if (balanceError.value) return t(balanceError.value);
  if (!balance.value) return t('start.free.loading');
  if (!balance.value.available) return t('start.free.paused');
  if (minutesLeft.value <= 0) return t('start.free.usedUp');
  return t('start.free.left', {
    left: minutesLeft.value,
    total: Math.floor(balance.value.monthSeconds / 60),
  });
});

async function refresh(): Promise<void> {
  if (!account.user) {
    balance.value = null;
    return;
  }
  balanceError.value = null;
  try {
    const answer = await fetchFreeBalance();
    if ('seconds' in answer) balance.value = answer;
    else balanceError.value = answer.userMessageKey;
  } catch (err) {
    balanceError.value = logError('Reading the free minutes failed', err).userMessageKey;
  }
}

if (shown) {
  // Again after each session, which used some of them
  watch(
    () => [account.user?.uid, session.active] as const,
    ([, active]) => {
      if (!active) void refresh();
    },
    { immediate: true },
  );
}

function signIn(): void {
  account.signIn().catch((err: unknown) => logError('Signing in for free minutes failed', err));
}
</script>

<template>
  <div v-if="shown" class="free">
    <span class="free__or">{{ t('start.free.or') }}</span>
    <template v-if="account.user">
      <button
        class="free__cta lg-btn"
        type="button"
        :disabled="props.disabled || !canUse || session.starting"
        @click="emit('start')"
      >
        {{ t('start.free.button') }}
      </button>
      <p class="free__hint" role="status">{{ status }}</p>
    </template>
    <template v-else>
      <button
        class="free__cta lg-btn"
        type="button"
        :disabled="!account.ready || account.busy"
        @click="signIn"
      >
        {{ t('start.free.signIn') }}
      </button>
      <p class="free__hint">{{ t('start.free.note') }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.free {
  display: grid;
  gap: 8px;

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

  &__cta {
    height: 46px;
    font-size: 15px;
  }

  &__hint {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
}
</style>
