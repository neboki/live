import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { SIZE_WRITE_DELAY_MS, useOverlayStore } from './useOverlayStore';

const PREFS_KEY = 'neboki-live:overlay-prefs';

describe('useOverlayStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts waiting with every extra off', () => {
    const store = useOverlayStore();

    expect(store.waiting).toBe(true);
    expect(store.activeExtras).toBe(0);
    expect(store.notice).toBeNull();
  });

  it('moves the finished sentence to the history when a new one starts', () => {
    const store = useOverlayStore();
    store.startTranslation('Hello there.');
    store.finishTranslation();
    store.startTranslation();
    store.appendTranslation('Second ');
    store.appendTranslation('one.');

    expect(store.previous).toBe('Hello there.');
    expect(store.translation).toEqual({ id: 2, text: 'Second one.', done: false, speaker: null });
  });

  it('keeps who said each sentence, and the names given to the voices', () => {
    const store = useOverlayStore();
    store.startTranslation('Hi.', 1);
    store.startTranslation('Hello.', 0);
    expect(store.history).toEqual([{ id: 1, text: 'Hi.', speaker: 1 }]);
    expect(store.translation.speaker).toBe(0);

    store.setSpeakerName(1, '  Jim ');
    expect(store.speakerNames).toEqual({ 1: 'Jim' });
    store.setSpeakerName(1, '');
    expect(store.speakerNames).toEqual({});
  });

  it('starts the conversation over without changing the languages', () => {
    const store = useOverlayStore();
    store.reset({ from: 'JA', to: 'ES' });
    store.startTranslation('Hi.', 1);
    store.startTranslation('Hello.', 0);
    store.setSpeakerName(0, 'Jim');
    store.setSummary(['A point']);
    const before = store.conversation;

    store.clearConversation();
    expect(store.history).toEqual([]);
    expect(store.waiting).toBe(true);
    expect(store.speakerNames).toEqual({});
    expect(store.summary).toEqual([]);
    expect(store.pair).toEqual({ from: 'JA', to: 'ES' });
    expect(store.conversation).toBe(before + 1);
  });

  it('mixes the original audio by its own level, softer under the translated voice', () => {
    const store = useOverlayStore();
    store.originalLevel = 0.8;
    expect(store.originalVolume).toBeCloseTo(0.8);

    store.options.voice = true;
    store.hearOriginal = true;
    expect(store.originalVolume).toBeCloseTo(0.2);

    store.hearOriginal = false;
    expect(store.originalVolume).toBe(0);
  });

  it('keeps only the last summary points visible', () => {
    const store = useOverlayStore();
    store.setSummary(['a', 'b', 'c', 'd', 'e']);

    expect(store.visibleSummary).toEqual(['b', 'c', 'd', 'e']);
  });

  it('clamps the voice level between 0 and 1', () => {
    const store = useOverlayStore();
    store.setLevel(3);
    expect(store.level).toBe(1);
    store.setLevel(-1);
    expect(store.level).toBe(0);
  });

  it('reset clears the conversation but keeps preferences', () => {
    const store = useOverlayStore();
    store.toggleOption('summary');
    store.startTranslation('Hi');
    store.setNotice('live.reconnecting');
    store.reset({ from: 'DE', to: 'ES' });

    expect(store.waiting).toBe(true);
    expect(store.notice).toBeNull();
    expect(store.options.summary).toBe(true);
    expect(store.pair).toEqual({ from: 'DE', to: 'ES' });
  });

  describe('notice', () => {
    it('clears itself after the ttl', () => {
      vi.useFakeTimers();
      const store = useOverlayStore();
      store.setNotice('errors.rateLimited', 8000);

      vi.advanceTimersByTime(7999);
      expect(store.notice).toBe('errors.rateLimited');
      vi.advanceTimersByTime(1);
      expect(store.notice).toBeNull();
    });

    it('stays without a ttl until cleared', () => {
      vi.useFakeTimers();
      const store = useOverlayStore();
      store.setNotice('live.reconnecting');

      vi.advanceTimersByTime(60_000);
      expect(store.notice).toBe('live.reconnecting');
      store.setNotice(null);
      expect(store.notice).toBeNull();
    });

    it('a new notice cancels the previous timer', () => {
      vi.useFakeTimers();
      const store = useOverlayStore();
      store.setNotice('errors.rateLimited', 1000);
      store.setNotice('live.reconnecting');

      vi.advanceTimersByTime(5000);
      expect(store.notice).toBe('live.reconnecting');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('shows the detected language in upper case', () => {
    const store = useOverlayStore();
    store.reset({ from: 'AUTO', to: 'ES' });
    store.setDetectedLanguage('ja');

    expect(store.pair).toEqual({ from: 'JA', to: 'ES' });
    store.setDetectedLanguage('  ');
    expect(store.pair.from).toBe('JA');
  });

  describe('preferences', () => {
    it('are saved and restored on the next visit', async () => {
      const store = useOverlayStore();
      store.toggleOption('voice');
      store.glossary = 'Acme\nSCADA';
      store.scale = 1.2;
      store.opacity = 0.5;
      store.theme = 'ocean';
      await nextTick();

      setActivePinia(createPinia());
      const next = useOverlayStore();
      expect(next.options.voice).toBe(true);
      expect(next.options.source).toBe(false);
      expect(next.glossary).toBe('Acme\nSCADA');
      expect(next.scale).toBe(1.2);
      expect(next.opacity).toBe(0.5);
      expect(next.theme).toBe('ocean');
    });

    it('ignore an unknown stored theme', () => {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: 'neon' }));
      expect(useOverlayStore().theme).toBe('sunset');
    });

    it('fall back to the defaults when the stored value is unreadable', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      window.localStorage.setItem(PREFS_KEY, '{not json');
      const store = useOverlayStore();

      expect(store.scale).toBe(1);
      expect(store.glossary).toBe('');
      expect(store.activeExtras).toBe(0);
    });

    it('ignore fields of the wrong type', () => {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ options: { summary: 'yes', source: true }, scale: 'big', glossary: 3 }),
      );
      const store = useOverlayStore();

      expect(store.options).toEqual({
        source: true,
        voice: false,
        suggestions: false,
        summary: false,
        speakers: true,
      });
      expect(store.scale).toBe(1);
      expect(store.glossary).toBe('');
    });

    it('remember the bar and floating window sizes', async () => {
      vi.useFakeTimers();
      const store = useOverlayStore();
      const write = vi.spyOn(Storage.prototype, 'setItem');
      store.pipSize = { width: 700, height: 260 };
      await nextTick();
      write.mockClear();
      // A drag: many sizes in a row, one write once it rests
      for (let width = 600; width <= 800; width += 10) store.setSize({ width });
      store.setSize({ height: 300 });
      await nextTick();
      expect(write).not.toHaveBeenCalled();
      vi.advanceTimersByTime(SIZE_WRITE_DELAY_MS);
      expect(write).toHaveBeenCalledTimes(1);
      vi.useRealTimers();

      setActivePinia(createPinia());
      const next = useOverlayStore();
      expect(next.size).toEqual({ width: 800, height: 300 });
      expect(next.pipSize).toEqual({ width: 700, height: 260 });
      expect(next.resized).toBe(true);
      next.resetSize();
      expect(next.size).toEqual({ width: null, height: null });
      expect(next.resized).toBe(false);
    });

    it('keep sizes, text size and opacity inside their limits', () => {
      const store = useOverlayStore();
      store.setSize({ width: 10, height: 99_999 });
      expect(store.size).toEqual({ width: 380, height: 720 });

      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ scale: 9, opacity: 0, size: { width: 'wide' }, pipSize: { width: 20 } }),
      );
      setActivePinia(createPinia());
      const next = useOverlayStore();
      expect(next.scale).toBe(1.8);
      expect(next.opacity).toBe(0.3);
      expect(next.size).toEqual({ width: null, height: null });
      expect(next.pipSize).toBeNull();
    });

    it('keep working when storage throws', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const store = useOverlayStore();

      expect(store.opacity).toBe(0.76);
      store.toggleOption('source');
      await nextTick();
      expect(store.options.source).toBe(true);
    });
  });
});

describe('useOverlayStore and where the captions go', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('starts in the floating window, and remembers the page when chosen', async () => {
    const store = useOverlayStore();
    expect(store.placement).toBe('floating');

    store.placement = 'page';
    await nextTick();

    setActivePinia(createPinia());
    expect(useOverlayStore().placement).toBe('page');
  });

  it('ignores a remembered placement it does not know', () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ placement: 'everywhere' }));

    expect(useOverlayStore().placement).toBe('floating');
  });
});
