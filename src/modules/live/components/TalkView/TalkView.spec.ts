import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOverlayStore } from '@/modules/overlay';
import { type SessionLine, useSessionRecord } from '@/modules/session';
import { i18n } from '@/shared/i18n';
import { PARTNER_SPEAKER, USER_SPEAKER } from '../../pipeline/conversation';
import { useLiveSession } from '../../store/useLiveSession';
import TalkView from './TalkView.vue';

/** The user reads Spanish; the other person English */
function talk(lines: SessionLine[]): VueWrapper {
  useOverlayStore().pair = { from: 'en', to: 'es' };
  useLiveSession().partner = 'en';
  const record = useSessionRecord();
  record.begin({ pair: { from: 'en', to: 'es' }, startedAt: 0 });
  lines.forEach((line) => record.addLine(line));
  return mount(TalkView, { global: { plugins: [i18n] } });
}

function halfText(wrapper: VueWrapper, lang: string): string {
  return wrapper.find(`.talk__half[lang="${lang}"] .talk__text`).text();
}

describe('TalkView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows each person the other one translated into their language', () => {
    const wrapper = talk([
      {
        at: 1,
        source: 'Where is the station?',
        language: 'en',
        translation: '¿Dónde está la estación?',
        speaker: PARTNER_SPEAKER,
      },
    ]);
    expect(halfText(wrapper, 'es')).toBe('¿Dónde está la estación?');
    expect(halfText(wrapper, 'en')).toBe('Where is the station?');
    wrapper.unmount();
  });

  it('never puts the other language in a half when a sentence was not translated', () => {
    const wrapper = talk([
      { at: 1, source: 'Hola', language: 'es', translation: 'Hello', speaker: USER_SPEAKER },
      // The user turned their translations off: this one has none
      {
        at: 2,
        source: 'Nice to meet you',
        language: 'en',
        translation: '',
        speaker: PARTNER_SPEAKER,
      },
    ]);
    // The Spanish half keeps the last Spanish text instead of the English sentence
    expect(halfText(wrapper, 'es')).toBe('Hola');
    expect(halfText(wrapper, 'es')).not.toContain('Nice');
    wrapper.unmount();
  });

  it('places a sentence nobody was matched to by the language it was heard in', () => {
    const wrapper = talk([
      { at: 1, source: 'Buenos días', language: 'es', translation: 'Good morning' },
    ]);
    expect(halfText(wrapper, 'es')).toBe('Buenos días');
    expect(halfText(wrapper, 'en')).toBe('Good morning');
    wrapper.unmount();
  });
});
