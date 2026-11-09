<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useSessionViewer } from '@/modules/session';
import { useTwoStep } from '../../composables/useTwoStep';
import { useCloudHistory } from '../../store/useCloudHistory';

/** The session page's extra action for a conversation from the account: deleting it */
const { t } = useI18n();
const viewer = useSessionViewer();
const history = useCloudHistory();
const remove = useTwoStep(() => (viewer.cloudId ? history.remove(viewer.cloudId) : false));
</script>

<template>
  <span v-if="history.errorKey" class="cloud-actions__error" role="alert">
    {{ t(history.errorKey) }}
  </span>
  <button
    v-if="viewer.cloudId"
    class="lg-btn cloud-actions__delete"
    :class="{ 'cloud-actions__delete--armed': remove.armed.value }"
    type="button"
    :disabled="history.deleting"
    @click="remove.press"
  >
    {{
      history.deleting
        ? t('account.history.deleting')
        : remove.armed.value
          ? t('account.history.deleteConfirm')
          : t('account.history.delete')
    }}
  </button>
</template>

<style scoped lang="scss">
.cloud-actions {
  &__error {
    color: var(--danger);
    font-size: 12.5px;
  }

  &__delete--armed {
    border-color: var(--danger);
    color: var(--danger);
  }
}
</style>
