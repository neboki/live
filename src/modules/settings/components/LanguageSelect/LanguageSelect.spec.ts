import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { ORIGINAL_LANGUAGE } from '../../languages';
import { useSettingsStore } from '../../store/useSettingsStore';
import LanguageSelect from './LanguageSelect.vue';

function mountSelect(compact = false): VueWrapper {
  return mount(LanguageSelect, {
    props: { compact },
    attachTo: document.body,
    global: { plugins: [i18n] },
  });
}

describe('LanguageSelect', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    useSettingsStore().targetLanguage = 'fr';
  });

  it('shows the chosen language and opens its own list, "don\'t translate" first', async () => {
    const wrapper = mountSelect();
    const trigger = wrapper.get('button');

    expect(trigger.text()).toContain('French');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);

    await trigger.trigger('click');
    const options = wrapper.findAll('[role="option"]');

    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(options[0]?.text()).toContain("Don't translate");
    expect(options.find((o) => o.attributes('aria-selected') === 'true')?.text()).toBe('French');
    wrapper.unmount();
  });

  it('picks a language on click and closes', async () => {
    const wrapper = mountSelect();
    await wrapper.get('button').trigger('click');

    const japanese = wrapper.findAll('[role="option"]').find((o) => o.text() === 'Japanese');
    await japanese?.trigger('click');

    expect(useSettingsStore().targetLanguage).toBe('ja');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(wrapper.get('button').text()).toContain('Japanese');
    wrapper.unmount();
  });

  it('moves with the arrows, jumps by typing and picks with Enter', async () => {
    const wrapper = mountSelect();
    await wrapper.get('button').trigger('keydown', { key: 'ArrowDown' });
    const list = wrapper.get('[role="listbox"]');
    const activeText = (): string =>
      wrapper.get(`#${list.attributes('aria-activedescendant')}`).text();

    expect(activeText()).toBe('French');
    await list.trigger('keydown', { key: 'Home' });
    expect(activeText()).toContain("Don't translate");

    await list.trigger('keydown', { key: 'ArrowDown' });
    await list.trigger('keydown', { key: 'ArrowDown' });
    expect(activeText()).toBe('Basque');

    await list.trigger('keydown', { key: 'g' });
    expect(activeText()).toBe('Galician');

    await list.trigger('keydown', { key: 'Enter' });
    expect(useSettingsStore().targetLanguage).toBe('gl');
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('turns translation off with the first choice', async () => {
    const wrapper = mountSelect();
    await wrapper.get('button').trigger('click');
    await wrapper.findAll('[role="option"]')[0]?.trigger('click');

    expect(useSettingsStore().targetLanguage).toBe(ORIGINAL_LANGUAGE);
    expect(wrapper.get('button').text()).toContain("Don't translate");
    wrapper.unmount();
  });

  it('closes on Escape and on a press outside, giving focus back to the pill', async () => {
    const wrapper = mountSelect();
    const trigger = wrapper.get('button');
    await trigger.trigger('click');
    expect(document.activeElement).toBe(wrapper.get('[role="listbox"]').element);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);

    await trigger.trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows only the code when compact, and names the full language for screen readers', () => {
    const wrapper = mountSelect(true);
    const trigger = wrapper.get('button');

    expect(trigger.text()).toBe('FR');
    expect(trigger.attributes('aria-label')).toContain('French');
    wrapper.unmount();
  });
});
