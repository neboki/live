import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '@/shared/i18n';
import en from '@/shared/i18n/locales/en.json';
import es from '@/shared/i18n/locales/es.json';
import { PRIVACY_CONTACT } from '@/shared/links';
import PrivacyView from './PrivacyView.vue';

function render(props: { accounts?: boolean; demo?: boolean } = {}) {
  return mount(PrivacyView, {
    props: { accounts: false, demo: false, ...props },
    global: { plugins: [i18n] },
  });
}

/** Every key path of a nested message object, arrays as one leaf with their length */
function shape(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return [`${path}[${value.length}]`];
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      shape(child, path ? `${path}.${key}` : key),
    );
  }
  return [path];
}

describe('PrivacyView', () => {
  afterEach(() => setLocale('en'));

  it('shows every core section with its table of contents', () => {
    const wrapper = render();
    const ids = wrapper.findAll('section').map((s) => s.attributes('id'));

    expect(ids).toEqual([
      'privacy-summary',
      'privacy-data',
      'privacy-device',
      'privacy-never',
      'privacy-files',
      'privacy-key',
      'privacy-security',
      'privacy-providers',
      'privacy-consent',
      'privacy-rights',
      'privacy-contact',
      'privacy-changes',
    ]);
    expect(wrapper.findAll('nav a').map((a) => a.attributes('href'))).toEqual(
      ids.map((id) => `#${id}`),
    );
    wrapper.unmount();
  });

  it('lists what is sent, where and when, one row per data flow', () => {
    const wrapper = render();

    expect(wrapper.findAll('tbody tr')).toHaveLength(7);
    expect(wrapper.text()).toContain(en.privacyPage.data.rows.key.what);
    expect(wrapper.text()).toContain(en.privacyPage.data.azure);
    wrapper.unmount();
  });

  it('fills the brand and the contact address, as a mail link', () => {
    const wrapper = render();

    expect(wrapper.text()).toContain('Neboki Live runs in your browser');
    expect(wrapper.text()).not.toMatch(/\{(brand|email)\}/);
    expect(wrapper.find(`a[href="mailto:${PRIVACY_CONTACT}"]`).exists()).toBe(true);
    wrapper.unmount();
  });

  it('only mentions sign-in and the demo when the build offers them', () => {
    const plain = render();
    expect(plain.find('#privacy-account').exists()).toBe(false);
    expect(plain.find('#privacy-demo').exists()).toBe(false);
    expect(plain.text()).not.toContain(en.privacyPage.summary.demo);
    plain.unmount();

    const full = render({ accounts: true, demo: true });
    expect(full.find('#privacy-account').exists()).toBe(true);
    expect(full.find('#privacy-demo').exists()).toBe(true);
    expect(full.text()).toContain(en.privacyPage.summary.demo);
    expect(full.text()).toContain(en.privacyPage.device.account);
    full.unmount();
  });

  it('opens the providers’ own policies in a new tab', () => {
    const wrapper = render();
    const links = wrapper.findAll('#privacy-providers a');

    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.attributes('href')).toMatch(/^https:\/\//);
      expect(link.attributes('rel')).toBe('noopener noreferrer');
    }
    wrapper.unmount();
  });

  it('reads in Spanish too', async () => {
    const wrapper = render();
    setLocale('es');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('h1').text()).toBe(es.privacyPage.title);
    expect(wrapper.text()).toContain('Neboki Live funciona en tu navegador');
    wrapper.unmount();
  });

  it('has the same messages in both languages', () => {
    expect(shape(es.privacyPage)).toEqual(shape(en.privacyPage));
  });
});
