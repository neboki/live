import { onBeforeUnmount, watchEffect, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { brand } from '@/shared/brand/brand';
import { useOverlayStore } from '../store/useOverlayStore';

/**
 * Writes the languages (or "Paused") into the floating window's title bar, so the bar
 * itself does not need to repeat them. `bar` lives in that window: its document is the one.
 */
export function usePipTitle(bar: Ref<HTMLElement | null>, enabled: () => boolean): void {
  const store = useOverlayStore();
  const { t } = useI18n();

  const stop = watchEffect(() => {
    const doc = bar.value?.ownerDocument;
    if (!enabled() || !doc || doc === document) return;
    const { from, to } = store.pair;
    const pair = from && to ? `${from} → ${to}` : '';
    const state = store.paused ? `⏸ ${t('overlay.paused')}` : pair;
    const name = brand.value.name;
    doc.title = state ? `${state} · ${name}` : name;
  });
  onBeforeUnmount(stop);
}
