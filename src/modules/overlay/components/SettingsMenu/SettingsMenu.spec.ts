import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import SettingsMenu from './SettingsMenu.vue';

function mountMenu(props: { page?: boolean } = {}): ReturnType<typeof mount> {
  return mount(SettingsMenu, { props: { popped: true, ...props }, global: { plugins: [i18n] } });
}

describe('SettingsMenu', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('groups its options under titles, the same in the bar and on the page', () => {
    const t = i18n.global.t;
    for (const page of [false, true]) {
      const wrapper = mountMenu({ page });
      expect(wrapper.findAll('.menu__group').length).toBeGreaterThanOrEqual(5);
      expect(wrapper.text()).toContain(t('overlay.groups.show'));
      expect(wrapper.text()).toContain(t('overlay.groups.accuracy'));
      wrapper.unmount();
    }
  });

  it('leaves out what only acts on a running conversation on the settings page', () => {
    const t = i18n.global.t;
    const bar = mountMenu();
    expect(bar.text()).toContain(t('overlay.startOver.label'));
    expect(bar.text()).toContain(t('overlay.export.file'));
    bar.unmount();

    const page = mountMenu({ page: true });
    expect(page.text()).not.toContain(t('overlay.startOver.label'));
    expect(page.text()).not.toContain(t('overlay.export.file'));
    expect(page.find('kbd').exists()).toBe(false);
    page.unmount();
  });
});
