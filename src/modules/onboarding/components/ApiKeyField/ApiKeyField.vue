<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { onRadioKeydown } from '@/modules/overlay';
import {
  API_PROVIDERS,
  useSettingsStore,
  isLikelyAzureKey,
  isLikelyOpenAiKey,
} from '@/modules/settings';

type KeyStatus = 'empty' | 'invalid' | 'valid';

const KEY_PAGE = 'https://platform.openai.com/api-keys';

/**
 * The key, where the models run (OpenAI itself or an Azure OpenAI resource) and, for
 * Azure, the resource endpoint. On Azure the model names in settings are deployment names.
 */
const settings = useSettingsStore();
const { t } = useI18n();
const visible = ref(false);

const azure = computed(() => settings.provider === 'azure');
const status = computed<KeyStatus>(() => {
  const key = settings.apiKey.trim();
  if (!key) return 'empty';
  const looksRight = azure.value ? isLikelyAzureKey(key) : isLikelyOpenAiKey(key);
  return looksRight ? 'valid' : 'invalid';
});
const endpointStatus = computed<KeyStatus>(() => {
  if (!settings.azureEndpoint.trim()) return 'empty';
  return settings.endpointLooksValid ? 'valid' : 'invalid';
});
</script>

<template>
  <div class="key" :class="`key--${status}`">
    <div
      class="key__providers"
      role="radiogroup"
      :aria-label="t('start.key.provider.label')"
      @keydown="onRadioKeydown"
    >
      <button
        v-for="provider in API_PROVIDERS"
        :key="provider"
        class="key__provider"
        :class="{ 'key__provider--on': settings.provider === provider }"
        type="button"
        role="radio"
        :aria-checked="settings.provider === provider"
        :tabindex="settings.provider === provider ? 0 : -1"
        @click="settings.provider = provider"
      >
        {{ t(`start.key.provider.${provider}`) }}
      </button>
    </div>

    <div v-if="azure" class="key__endpoint" :class="`key__endpoint--${endpointStatus}`">
      <input
        id="lg-azure-endpoint"
        v-model.trim="settings.azureEndpoint"
        class="key__input key__input--endpoint"
        type="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="https://my-resource.openai.azure.com"
        :aria-label="t('start.key.endpoint.label')"
        :aria-invalid="endpointStatus === 'invalid'"
        aria-describedby="lg-azure-endpoint-help"
      />
      <p id="lg-azure-endpoint-help" class="key__help">
        {{
          endpointStatus === 'invalid'
            ? t('start.key.endpoint.invalid')
            : t('start.key.endpoint.help')
        }}
      </p>
    </div>

    <div class="key__line">
      <div class="key__box">
        <input
          id="lg-api-key"
          v-model.trim="settings.apiKey"
          class="key__input"
          :type="visible ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          :placeholder="azure ? '' : 'sk-…'"
          :aria-label="t('start.key.label')"
          :aria-invalid="status === 'invalid'"
          aria-describedby="lg-api-key-help"
        />
        <span class="key__check" aria-hidden="true">✓</span>
        <button
          class="key__toggle"
          type="button"
          :aria-label="visible ? t('start.key.hide') : t('start.key.show')"
          :aria-pressed="visible"
          @click="visible = !visible"
        >
          {{ visible ? t('start.key.hide') : t('start.key.show') }}
        </button>
      </div>
      <slot />
    </div>
    <p id="lg-api-key-help" class="key__help">
      <template v-if="status === 'invalid'">
        {{ azure ? t('start.key.azureInvalid') : t('start.key.invalid') }}
      </template>
      <template v-else-if="azure">{{ t('start.key.azureHelp') }}</template>
      <template v-else>
        {{ t('start.key.help') }}
        <a :href="KEY_PAGE" target="_blank" rel="noopener noreferrer">{{
          t('start.key.getOne')
        }}</a>
      </template>
    </p>
    <label class="key__remember">
      <input v-model="settings.remember" class="key__remember-box" type="checkbox" />
      {{ t('start.key.remember') }}
    </label>
  </div>
</template>

<style scoped lang="scss">
.key {
  display: grid;
  gap: 8px;

  // OpenAI or Azure, as a small segmented control
  &__providers {
    display: inline-flex;
    gap: 2px;
    width: fit-content;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-2);
  }

  &__provider {
    padding: 4px 10px;
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    background: none;
    color: var(--muted);
    font: 500 12px var(--font-ui);
    cursor: pointer;
    transition:
      background-color 0.12s,
      color 0.12s;

    &:hover {
      color: var(--fg);
    }

    &--on {
      background: var(--panel);
      box-shadow: var(--shadow-sm);
      color: var(--fg);
    }
  }

  &__endpoint {
    display: grid;
    gap: 8px;

    .key__input {
      height: 38px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      background: var(--panel);
    }

    &--invalid .key__input {
      border-color: var(--danger);
    }

    &--invalid .key__help {
      color: var(--danger);
    }

    &--valid .key__input {
      border-color: var(--success);
    }
  }

  // Input and the slotted Start button side by side; the button may ask to wrap below
  &__line {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  &__box {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    transition:
      border-color 0.12s,
      box-shadow 0.12s;

    &:hover:not(:focus-within) {
      border-color: var(--subtle);
    }

    &:focus-within {
      border-color: var(--accent);
      box-shadow: var(--shadow-focus);
    }
  }

  &--valid &__box {
    border-color: var(--success);
  }

  &--invalid &__box {
    border-color: var(--danger);
    animation: shake 0.4s;
  }

  &__input {
    flex: 1;
    min-width: 0;
    height: 42px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--fg);
    font: 400 13px var(--font-mono);
    outline: none;

    &::placeholder {
      color: var(--subtle);
    }

    // Edge adds its own reveal icon; we already have a Show/Hide button
    &::-ms-reveal {
      display: none;
    }
  }

  // Check mark that springs in once the key looks right
  &__check {
    color: var(--success);
    font-weight: 600;
    opacity: 0;
    transform: scale(0.4);
    transition:
      opacity 0.2s,
      transform 0.45s var(--ease-spring);
  }

  &--valid &__check {
    opacity: 1;
    transform: none;
  }

  &__toggle {
    padding: 0 12px;
    border: 0;
    background: none;
    color: var(--muted);
    font: 500 12px var(--font-ui);
    cursor: pointer;
    transition: color 0.12s;

    &:hover {
      color: var(--fg);
    }
  }

  &__help {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &--invalid &__help {
    color: var(--danger);
  }

  // Whether the key is kept for the next visit; off, it lives in memory only
  &__remember {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    width: fit-content;
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
  }

  &__remember-box {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
}

@keyframes shake {
  25% {
    transform: translateX(-4px);
  }

  75% {
    transform: translateX(4px);
  }
}
</style>
