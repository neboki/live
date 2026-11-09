import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { UnsupportedFeatureError } from '@/shared/errors';
import { copyStyles, useDocumentPip, type DocumentPip } from './useDocumentPip';

type PipApi = NonNullable<Window['documentPictureInPicture']>;

function setPipApi(api: PipApi | undefined): void {
  if (api)
    Object.defineProperty(window, 'documentPictureInPicture', { value: api, configurable: true });
  else Reflect.deleteProperty(window, 'documentPictureInPicture');
}

/** A real (jsdom) window to stand in for the floating one. */
function makePipWindow(): Window {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) throw new Error('jsdom did not create an iframe window');
  vi.spyOn(win, 'close').mockImplementation(() => undefined);
  return win;
}

function mountPip(): { pip: DocumentPip; unmount: () => void } {
  let pip: DocumentPip | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        pip = useDocumentPip();
        return () => h('div');
      },
    }),
  );
  if (!pip) throw new Error('setup did not run');
  return { pip, unmount: () => wrapper.unmount() };
}

describe('useDocumentPip', () => {
  afterEach(() => {
    setPipApi(undefined);
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('returns an UnsupportedFeatureError when the browser has no Document PiP', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setPipApi(undefined);
    const { pip } = mountPip();

    const error = await pip.open({ width: 600, height: 120 });

    expect(pip.isSupported).toBe(false);
    expect(error).toBeInstanceOf(UnsupportedFeatureError);
    expect(error?.userMessageKey).toBe('errors.pipUnsupported');
    expect(pip.pipWindow.value).toBeNull();
  });

  it('opens the window with the page styles, theme and language', async () => {
    const win = makePipWindow();
    const requestWindow = vi.fn<PipApi['requestWindow']>().mockResolvedValue(win);
    setPipApi({ window: null, requestWindow } as unknown as PipApi);
    const style = document.createElement('style');
    style.textContent = '.caption { color: red; }';
    document.head.appendChild(style);
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.lang = 'es';
    const { pip } = mountPip();

    const error = await pip.open({ width: 600, height: 120 });

    expect(error).toBeNull();
    expect(requestWindow).toHaveBeenCalledWith({ width: 600, height: 120 });
    expect(win.document.head.querySelector('style')?.textContent).toContain('.caption');
    expect(win.document.documentElement.dataset.theme).toBe('dark');
    expect(win.document.documentElement.lang).toBe('es');
    expect(pip.pipBody.value?.classList.contains('pip-body')).toBe(true);
  });

  it('forgets the window when it closes itself, and closes it on unmount', async () => {
    const win = makePipWindow();
    setPipApi({ window: null, requestWindow: vi.fn().mockResolvedValue(win) } as unknown as PipApi);
    const { pip, unmount } = mountPip();

    await pip.open({ width: 600, height: 120 });
    win.dispatchEvent(new Event('pagehide'));
    expect(pip.pipWindow.value).toBeNull();

    await pip.open({ width: 600, height: 120 });
    unmount();
    expect(win.close).toHaveBeenCalled();
    expect(pip.pipWindow.value).toBeNull();
  });
});

describe('copyStyles', () => {
  it('links linked sheets, clones inline ones and skips unreadable ones', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const target = document.implementation.createHTMLDocument('pip');
    const unreadable = {
      href: null,
      get cssRules(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const source = {
      styleSheets: [
        { href: 'http://localhost/live/assets/index.css' },
        {
          href: null,
          cssRules: [{ cssText: '.a { color: red; }' }, { cssText: '.b { top: 0; }' }],
        },
        unreadable,
      ],
    } as unknown as Document;

    copyStyles(source, target);

    const link = target.head.querySelector('link');
    expect(link?.rel).toBe('stylesheet');
    expect(link?.href).toBe('http://localhost/live/assets/index.css');
    expect(target.head.querySelector('style')?.textContent).toBe(
      '.a { color: red; }\n.b { top: 0; }',
    );
    expect(target.head.querySelectorAll('link, style')).toHaveLength(2);
    expect(error).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
