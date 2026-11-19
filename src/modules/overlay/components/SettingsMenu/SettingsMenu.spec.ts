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

  it('keeps three blocks in a session: see, hear and the session', () => {
    const t = i18n.global.t;
    const bar = mountMenu();
    const titles = bar.findAll('.menu__title').map((title) => title.text());
    expect(titles).toEqual([
      expect.stringContaining(t('overlay.groups.see')),
      expect.stringContaining(t('overlay.groups.hear')),
      expect.stringContaining(t('overlay.groups.session')),
    ]);
    expect(bar.text()).toContain(t('overlay.cc.label'));
    expect(bar.text()).not.toContain(t('overlay.groups.accuracy'));
    expect(bar.text()).not.toContain(t('overlay.cost.limit'));
    bar.unmount();
  });

  it('shows the technical options on the settings page', () => {
    const t = i18n.global.t;
    const page = mountMenu({ page: true });
    expect(page.text()).toContain(t('overlay.groups.see'));
    expect(page.text()).toContain(t('overlay.groups.accuracy'));
    expect(page.text()).toContain(t('overlay.cost.limit'));
    expect(page.text()).not.toContain(t('overlay.cc.label'));
    page.unmount();
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

  it('marks the options that are not reliable yet as experimental, and only those', () => {
    const t = i18n.global.t;
    const menu = mountMenu();
    const marked = menu
      .findAll('.menu__option')
      .filter((option) => option.find('.menu__experimental').exists())
      .map((option) => option.text());
    expect(marked).toEqual([
      expect.stringContaining(t('overlay.options.speakers.label')),
      expect.stringContaining(t('overlay.sync.label')),
    ]);
    menu.unmount();
  });
});
