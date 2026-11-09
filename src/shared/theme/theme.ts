// The colour scheme: the system's by default, or the one the user picked, remembered on
// this device. global.scss reads it from data-theme on the root element; the floating
// window copies the attribute when it opens.

import { ref, type Ref } from 'vue';
import { readStorage, writeStorage } from '@/shared/storage/safeStorage';

export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
const STORAGE_THEME = 'theme';

function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value);
}

export function loadTheme(): Theme {
  const stored = readStorage(STORAGE_THEME);
  return isTheme(stored) ? stored : 'system';
}

/** The current choice, for the UI to show */
export const theme: Ref<Theme> = ref(loadTheme());

/** Stamps the choice on a document's root; "system" leaves the media query in charge. */
export function applyTheme(choice: Theme, root: HTMLElement = document.documentElement): void {
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/** Switches the scheme, remembers it and applies it to the page. */
export function setTheme(choice: Theme): void {
  theme.value = choice;
  writeStorage(STORAGE_THEME, choice === 'system' ? null : choice);
  applyTheme(choice);
}
