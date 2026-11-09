import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';
import { BACKUP_KIND } from '../../utils/settingsBackup';
import SettingsBackup from './SettingsBackup.vue';

function mountBackup(reload = vi.fn()): ReturnType<typeof mount> {
  return mount(SettingsBackup, { props: { reload }, global: { plugins: [i18n] } });
}

function pickFile(wrapper: ReturnType<typeof mount>, text: string): void {
  const input = wrapper.find('input[type="file"]');
  const file = new File([text], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  void input.trigger('change');
}

describe('SettingsBackup', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it('asks for a second click before resetting, then reloads', async () => {
    writeStorage('theme', 'dark');
    const reload = vi.fn();
    const wrapper = mountBackup(reload);
    const reset = wrapper.findAll('button').at(2) ?? wrapper.find('button');

    await reset.trigger('click');
    expect(readStorage('theme')).toBe('dark');
    expect(reset.text()).toBe(i18n.global.t('settingsPage.backup.resetConfirm'));

    await reset.trigger('click');
    expect(readStorage('theme')).toBeNull();
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('disarms the reset after a while', async () => {
    const wrapper = mountBackup();
    const reset = wrapper.findAll('button').at(2) ?? wrapper.find('button');
    await reset.trigger('click');
    vi.advanceTimersByTime(6000);
    await flushPromises();
    expect(reset.text()).toBe(i18n.global.t('settingsPage.backup.reset'));
    wrapper.unmount();
  });

  it('restores a backup file and reloads', async () => {
    const reload = vi.fn();
    const wrapper = mountBackup(reload);
    pickFile(wrapper, JSON.stringify({ kind: BACKUP_KIND, version: 1, values: { theme: 'dark' } }));
    await vi.waitFor(() => expect(readStorage('theme')).toBe('dark'));
    vi.runAllTimers();
    expect(reload).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('says why a file was turned away and keeps the settings', async () => {
    writeStorage('theme', 'light');
    const reload = vi.fn();
    const wrapper = mountBackup(reload);
    pickFile(wrapper, '{"kind":"something else"}');
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').text()).not.toBe(''));
    expect(wrapper.find('[role="alert"]').text()).toBe(
      i18n.global.t('settingsPage.backup.errors.notOurs'),
    );
    expect(readStorage('theme')).toBe('light');
    expect(reload).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
