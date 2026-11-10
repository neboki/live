import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsTabs from './SettingsTabs.vue';

const TABS = [
  { id: 'a', icon: '1', label: 'First' },
  { id: 'b', icon: '2', label: 'Second' },
  { id: 'c', icon: '3', label: 'Third' },
] as const;

function mountTabs(active = 'a'): ReturnType<typeof mount> {
  return mount(SettingsTabs, {
    props: {
      tabs: TABS,
      label: 'Sections',
      idPrefix: 'x',
      modelValue: active,
    },
    attachTo: document.body,
  });
}

describe('SettingsTabs', () => {
  it('marks the active tab and links it to its panel', () => {
    const wrapper = mountTabs('b');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs[1]?.attributes('aria-controls')).toBe('x-panel-b');
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    wrapper.unmount();
  });

  it('moves with the arrow keys, Home and End, wrapping round', async () => {
    const wrapper = mountTabs('a');
    const tab = (i: number): ReturnType<typeof wrapper.find> =>
      wrapper.find(`#x-tab-${TABS[i]?.id ?? ''}`);
    await tab(0).trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['c']);
    await tab(2).trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['a']);
    await tab(0).trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['c']);
    await tab(2).trigger('keydown', { key: 'Home' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['a']);
    wrapper.unmount();
  });
});
