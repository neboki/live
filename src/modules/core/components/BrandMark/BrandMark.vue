<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { brand, logoUrl } from '@/shared/brand/brand';

/**
 * The brand's logo, or the drawn mark in the brand's accent when it has none or the file
 * is missing. Decorative: the brand's name always sits next to it as text.
 */
const failed = ref(false);
const src = computed(() => logoUrl(brand.value));
watch(src, () => {
  failed.value = false;
});

function onError(): void {
  console.warn(`[Neboki Live] Logo "${src.value ?? ''}" not found; showing the drawn mark`);
  failed.value = true;
}
</script>

<template>
  <img
    v-if="src && !failed"
    class="brand-mark brand-mark--logo"
    :src="src"
    alt=""
    @error="onError"
  />
  <svg v-else class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="#141416" />
    <rect class="brand-mark__accent" x="7" y="13" width="18" height="3" rx="1.5" />
    <rect x="7" y="19" width="12" height="3" rx="1.5" fill="#f3f4f6" opacity=".55" />
  </svg>
</template>

<style scoped lang="scss">
.brand-mark {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  box-shadow: 0 0 0 1px var(--line);

  &--logo {
    width: auto;
    max-width: 96px;
    object-fit: contain;
    background: #fff;
  }

  &__accent {
    fill: var(--accent);
  }
}
</style>
