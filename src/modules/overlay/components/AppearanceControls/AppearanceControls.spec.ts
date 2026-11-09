import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { useOverlayStore } from '../../store/useOverlayStore';
import AppearanceControls from './AppearanceControls.vue';

function mountControls(popped = false): VueWrapper {
  return mount(AppearanceControls, { props: { popped }, global: { plugins: [i18n] } });
}

describe('AppearanceControls', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('steps the text size and stops at the limits', async () => {
    const store = useOverlayStore();
    const wrapper = mountControls();
    const [smaller, larger] = wrapper.findAll('.look__stepper button');

    await larger?.trigger('click');
    await larger?.trigger('click');
    expect(store.scale).toBe(1.2);

    store.scale = 0.8;
    await wrapper.vm.$nextTick();
    expect(smaller?.attributes('disabled')).toBeDefined();
  });

  it('changes the background opacity live and shows it as a percentage', async () => {
    const store = useOverlayStore();
    const wrapper = mountControls();
    const range = wrapper.get('input[type="range"]');

    await range.setValue('0.45');
    expect(store.opacity).toBe(0.45);
    expect(wrapper.findAll('output')[1]?.text()).toMatch(/45\s?%/);
  });

  it('leaves out the opacity in the floating window, which is always opaque', () => {
    expect(mountControls(true).find('input[type="range"]').exists()).toBe(false);
  });

  it('switches the colour theme from its swatches', async () => {
    const store = useOverlayStore();
    const wrapper = mountControls();
    const sunset = wrapper.get('.themes__swatch--sunset');

    await sunset.trigger('click');
    expect(store.theme).toBe('sunset');
    expect(sunset.attributes('aria-checked')).toBe('true');
  });

  it('offers to reset the size only after the bar was resized', async () => {
    const store = useOverlayStore();
    const wrapper = mountControls();
    expect(wrapper.find('.look__reset').exists()).toBe(false);

    store.setSize({ width: 900 });
    await wrapper.vm.$nextTick();
    await wrapper.get('.look__reset').trigger('click');
    expect(store.resized).toBe(false);
  });
});
