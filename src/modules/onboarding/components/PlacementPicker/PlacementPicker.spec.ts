import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOverlayStore } from '@/modules/overlay/store/useOverlayStore';
import { i18n } from '@/shared/i18n';
import PlacementPicker from './PlacementPicker.vue';

function mountPicker(canFloat: boolean): ReturnType<typeof mount> {
  return mount(PlacementPicker, { props: { canFloat }, global: { plugins: [i18n] } });
}

describe('PlacementPicker', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('offers the floating window first, and keeps the choice in the bar preferences', async () => {
    const store = useOverlayStore();
    const wrapper = mountPicker(true);
    const radios = wrapper.findAll('input[type="radio"]');

    expect(radios.map((radio) => radio.attributes('value'))).toEqual(['floating', 'page']);
    expect((radios[0]?.element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.text()).toContain(i18n.global.t('start.where.hint.floating'));

    await radios[1]?.trigger('change');

    expect(store.placement).toBe('page');
    expect(wrapper.get('.lg-choice__option--on').text()).toContain(
      i18n.global.t('start.where.page.name'),
    );
    expect(wrapper.text()).toContain(i18n.global.t('start.where.hint.page'));
    wrapper.unmount();
  });

  it('settles on the page where the browser has no floating window', () => {
    const store = useOverlayStore();
    store.placement = 'floating';
    const wrapper = mountPicker(false);
    const [floating, page] = wrapper.findAll('input[type="radio"]');

    expect(floating?.attributes('disabled')).toBeDefined();
    expect((page?.element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.get('.lg-choice__option--on').text()).toContain(
      i18n.global.t('start.where.page.name'),
    );
    expect(wrapper.text()).toContain(i18n.global.t('start.where.unavailable'));
    // The remembered preference is left alone: it applies again on a browser that can float
    expect(store.placement).toBe('floating');
    wrapper.unmount();
  });
});
