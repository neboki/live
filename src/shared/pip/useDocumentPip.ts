import {
  computed,
  markRaw,
  onBeforeUnmount,
  shallowRef,
  type ComputedRef,
  type ShallowRef,
} from 'vue';
import { UnsupportedFeatureError, logError, type AppError } from '@/shared/errors';

export interface PipSize {
  width: number;
  height: number;
}

export interface DocumentPip {
  isSupported: boolean;
  pipWindow: ShallowRef<Window | null>;
  pipBody: ComputedRef<HTMLElement | null>;
  /**
   * Opens the window. Needs a click, and uses it up: call it synchronously from the
   * click handler, after anything else that needs the click (the share dialog).
   */
  open: (size: PipSize) => Promise<AppError | null>;
  close: () => void;
}

/**
 * Copies the page styles into the floating window. Linked sheets are linked again, so their
 * relative URLs (the self-hosted fonts) resolve exactly as on the page; inline sheets (Vite dev,
 * component styles) are cloned rule by rule. Both are allowed by the CSP ('self', 'unsafe-inline').
 */
export function copyStyles(source: Document, target: Document): void {
  for (const sheet of Array.from(source.styleSheets)) {
    if (sheet.href) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.head.appendChild(link);
      continue;
    }
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
      target.head.appendChild(style);
    } catch (err) {
      // An unreadable sheet only costs some styling in the floating window
      logError('Could not copy a stylesheet to the floating window', err);
    }
  }
}

/** A Document Picture-in-Picture window, not tied to any component (a store can own it). */
export function createDocumentPip(): DocumentPip {
  const isSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  const pipWindow = shallowRef<Window | null>(null);
  const pipBody = computed(() => pipWindow.value?.document.body ?? null);

  async function open(size: PipSize): Promise<AppError | null> {
    try {
      const api = window.documentPictureInPicture;
      if (!api)
        throw new UnsupportedFeatureError('documentPictureInPicture', 'errors.pipUnsupported');

      // First statement that awaits: requestWindow still runs inside the click
      const win = await api.requestWindow(size);
      copyStyles(document, win.document);
      const theme = document.documentElement.dataset.theme;
      if (theme) win.document.documentElement.dataset.theme = theme;
      const brand = document.documentElement.dataset.brand;
      if (brand) win.document.documentElement.dataset.brand = brand;
      // A custom accent: its stylesheet came over with the others, this switches it on
      if (document.documentElement.hasAttribute('data-brand-accent'))
        win.document.documentElement.setAttribute('data-brand-accent', '');
      win.document.documentElement.lang = document.documentElement.lang;
      win.document.title = document.title;
      win.document.body.classList.add('pip-body');
      // The user closed it (or the browser's "back to tab"): only forget this very window
      win.addEventListener(
        'pagehide',
        () => {
          if (pipWindow.value === win) pipWindow.value = null;
        },
        { once: true },
      );
      pipWindow.value = markRaw(win);
      return null;
    } catch (err) {
      return logError('Could not open the floating window', err);
    }
  }

  function close(): void {
    const win = pipWindow.value;
    pipWindow.value = null;
    win?.close();
  }

  return { isSupported, pipWindow, pipBody, open, close };
}

/** Same, closed when the calling component unmounts. */
export function useDocumentPip(): DocumentPip {
  const pip = createDocumentPip();

  onBeforeUnmount(pip.close);

  return pip;
}
