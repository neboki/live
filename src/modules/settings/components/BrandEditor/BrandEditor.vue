<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAccount, useCloudBrand } from '@/modules/account';
import { useFloatingWindow } from '@/modules/overlay';
import {
  BRANDS,
  brand,
  logoUrl,
  MAX_BRAND_NAME,
  applyBrand,
  brandCustom,
  brandId,
  resetBrandCustom,
  updateBrandCustom,
  type BrandCustom,
} from '@/shared/brand/brand';
import { LOGO_ACCEPT, readLogoFile } from '@/shared/brand/logoFile';
import { logError } from '@/shared/errors';

/**
 * The person's own name, logo and accent colour for the app, over the brand's own.
 * Every change shows at once, here and in the floating window, and is kept in this
 * browser and, signed in, in the account (useCloudBrand). Empty fields fall back to the
 * brand's.
 */
const { t } = useI18n();
const floating = useFloatingWindow();
const account = useAccount();
const cloudBrand = useCloudBrand();
/** Where the brand is kept, and how the last save to the account went */
const syncKey = computed(() =>
  account.enabled && account.user
    ? `settingsPage.brand.sync.${cloudBrand.status}`
    : 'settingsPage.brand.sync.local',
);
const fileInput = ref<HTMLInputElement | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

const base = computed(() => BRANDS[brandId.value]);
/** The name as typed: spaces stay while typing, the stored name is trimmed */
const nameDraft = ref(brandCustom.value.name ?? '');
/** What <input type="color"> shows when no colour is set: the default coral */
const DEFAULT_ACCENT = '#ff5a5f';
const accent = computed(() => brandCustom.value.accent ?? DEFAULT_ACCENT);
const logo = computed(() => logoUrl(brand.value));
const isCustom = computed(() => Object.keys(brandCustom.value).length > 0);

// The name can also change from the account (on sign-in): show it, unless it is just
// what is being typed
watch(
  () => brandCustom.value.name ?? '',
  (name) => {
    if (name !== nameDraft.value.trim()) nameDraft.value = name;
  },
);

function update(patch: Partial<Record<keyof BrandCustom, string | null>>): void {
  updateBrandCustom(patch);
  const pipRoot = floating.pipWindow?.document.documentElement;
  if (pipRoot) applyBrand(brandId.value, pipRoot);
}

function onName(): void {
  update({ name: nameDraft.value });
}

function onAccent(event: Event): void {
  const value = (event.target as HTMLInputElement | null)?.value;
  if (value) update({ accent: value });
}

function pickLogo(): void {
  error.value = null;
  fileInput.value?.click();
}

async function onLogoPicked(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (target) target.value = '';
  if (!file) return;
  busy.value = true;
  try {
    const result = await readLogoFile(file);
    if (result.ok) update({ logo: result.dataUrl });
    else error.value = `settingsPage.brand.errors.${result.error}`;
  } catch (err) {
    logError('Setting a custom logo failed', err);
    error.value = 'settingsPage.brand.errors.unreadable';
  } finally {
    busy.value = false;
  }
}

function onReset(): void {
  nameDraft.value = '';
  error.value = null;
  resetBrandCustom();
  const pipRoot = floating.pipWindow?.document.documentElement;
  if (pipRoot) applyBrand(brandId.value, pipRoot);
}
</script>

<template>
  <div class="brand-editor">
    <p class="brand-editor__hint">{{ t('settingsPage.brand.hint') }}</p>
    <p class="brand-editor__hint" role="status">{{ t(syncKey) }}</p>

    <label class="brand-editor__row" for="brand-name">
      <span class="brand-editor__label">{{ t('settingsPage.brand.name') }}</span>
      <input
        id="brand-name"
        v-model="nameDraft"
        class="brand-editor__input"
        type="text"
        :maxlength="MAX_BRAND_NAME"
        :placeholder="base.name"
        autocomplete="off"
        @input="onName"
      />
    </label>

    <div class="brand-editor__row">
      <span class="brand-editor__label">{{ t('settingsPage.brand.logo') }}</span>
      <div class="brand-editor__logo">
        <img
          v-if="logo"
          class="brand-editor__preview"
          :src="logo"
          :alt="t('settingsPage.brand.logoAlt')"
        />
        <span v-else class="brand-editor__none">{{ t('settingsPage.brand.noLogo') }}</span>
        <button class="lg-btn" type="button" :disabled="busy" @click="pickLogo">
          {{ t('settingsPage.brand.upload') }}
        </button>
        <button
          v-if="brandCustom.logo"
          class="lg-btn lg-btn--quiet"
          type="button"
          @click="update({ logo: null })"
        >
          {{ t('settingsPage.brand.remove') }}
        </button>
      </div>
    </div>
    <input
      ref="fileInput"
      class="brand-editor__file"
      type="file"
      :accept="LOGO_ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      @change="onLogoPicked"
    />

    <div class="brand-editor__row">
      <label class="brand-editor__label" for="brand-accent">
        {{ t('settingsPage.brand.color') }}
      </label>
      <div class="brand-editor__logo">
        <input
          id="brand-accent"
          class="brand-editor__color"
          type="color"
          :value="accent"
          @input="onAccent"
        />
        <button
          v-if="brandCustom.accent"
          class="lg-btn lg-btn--quiet"
          type="button"
          @click="update({ accent: null })"
        >
          {{ t('settingsPage.brand.defaultColor') }}
        </button>
      </div>
    </div>

    <p class="brand-editor__status" :role="error ? 'alert' : undefined">
      {{ error ? t(error) : '' }}
    </p>

    <div v-if="isCustom" class="brand-editor__actions">
      <button class="lg-btn" type="button" @click="onReset">
        {{ t('settingsPage.brand.reset', { name: base.name }) }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.brand-editor {
  display: grid;
  gap: 12px;

  &__hint {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
  }

  &__label {
    font-size: 13px;
    font-weight: 500;
  }

  &__input {
    flex: 1 1 200px;
    max-width: 280px;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--fg);
    font: inherit;

    &:focus-visible {
      border-color: var(--accent);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &__logo {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  &__preview {
    width: auto;
    max-width: 120px;
    height: 32px;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: 0 0 0 1px var(--line);
    object-fit: contain;
  }

  &__none {
    color: var(--subtle);
    font-size: 12.5px;
  }

  &__color {
    width: 44px;
    height: 34px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--panel);
    cursor: pointer;
  }

  &__file {
    display: none;
  }

  &__status {
    min-height: 1.4em;
    margin: 0;
    color: var(--danger);
    font-size: 12.5px;
  }
}
</style>
