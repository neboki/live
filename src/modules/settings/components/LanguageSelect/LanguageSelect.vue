<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDismiss } from '@/modules/overlay';
import { languageLabel, ORIGINAL_LANGUAGE, TARGET_LANGUAGES } from '../../languages';
import { useSettingsStore } from '../../store/useSettingsStore';

interface LanguageOption {
  code: string;
  label: string;
}

type ListSide = 'above' | 'below';

/** Tallest the list gets when there is room; it scrolls past that */
const LIST_MAX_HEIGHT = 320;
const LIST_MIN_HEIGHT = 140;
/** Gap between the pill and the list, plus a margin to the edge of the window */
const GAP = 6;
const EDGE = 12;
/** Letters typed closer together than this are matched as one word */
const TYPEAHEAD_MS = 600;

/**
 * Picks the language the captions are translated into: a pill that opens its own
 * list (no native select), with keyboard navigation and type-ahead as a listbox.
 * `compact` shows only the code, for the caption bar's language pill, in the glass
 * colours. `prominent` is the start screen's field: full width, a globe and the
 * language large, titled like the cards around it. The first choice turns
 * translation off, for a quick transcription.
 */
defineProps<{
  compact?: boolean;
  prominent?: boolean;
}>();

const settings = useSettingsStore();
const { t, locale } = useI18n();
const id = useId();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLElement | null>(null);
const open = ref(false);
/** Index of the option the keyboard is on */
const active = ref(0);
const side = ref<ListSide>('below');
const maxHeight = ref(LIST_MAX_HEIGHT);
/** Sideways nudge (px) that keeps the open list inside the window */
const shift = ref(0);
let typed = '';
let typedTimer: ReturnType<typeof setTimeout> | undefined;

const options = computed<LanguageOption[]>(() => {
  const languages = TARGET_LANGUAGES.map((code) => ({
    code,
    label: languageLabel(code, locale.value),
  })).sort((a, b) => a.label.localeCompare(b.label, locale.value));
  return [{ code: ORIGINAL_LANGUAGE, label: t('language.original') }, ...languages];
});
const selected = computed(() =>
  Math.max(
    0,
    options.value.findIndex((option) => option.code === settings.targetLanguage),
  ),
);
const current = computed(() => options.value[selected.value]?.label ?? '');
const code = computed(() =>
  settings.targetLanguage === ORIGINAL_LANGUAGE
    ? t('language.originalShort')
    : settings.targetLanguage.toUpperCase(),
);

function optionId(index: number): string {
  return `${id}-option-${index}`;
}

/** Opens below the pill unless the window's bottom is closer than its top */
function place(): void {
  const el = root.value;
  const win = el?.ownerDocument.defaultView;
  if (!el || !win) return;
  const rect = el.getBoundingClientRect();
  const below = win.innerHeight - rect.bottom - GAP - EDGE;
  const above = rect.top - GAP - EDGE;
  side.value = below >= LIST_MAX_HEIGHT || below >= above ? 'below' : 'above';
  const room = side.value === 'below' ? below : above;
  maxHeight.value = Math.max(LIST_MIN_HEIGHT, Math.min(LIST_MAX_HEIGHT, room));
}

/**
 * Slides the open list sideways so it stays inside the window: on a phone the pill
 * sits mid-bar and a list anchored to it ran past the right edge, scrolling the page.
 * Offsets ignore transforms, so the opening animation does not skew the measure.
 */
function fitInWindow(): void {
  const el = root.value;
  const menu = list.value;
  const doc = el?.ownerDocument;
  if (!el || !menu || !doc) return;
  const viewport = doc.documentElement.clientWidth;
  const left = el.getBoundingClientRect().left + menu.offsetLeft;
  const right = left + menu.offsetWidth;
  let offset = 0;
  if (right > viewport - EDGE) offset = viewport - EDGE - right;
  if (left + offset < EDGE) offset = EDGE - left;
  shift.value = offset;
}

function scrollActiveIntoView(): void {
  const option = list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`);
  if (typeof option?.scrollIntoView === 'function') option.scrollIntoView({ block: 'nearest' });
}

function moveTo(index: number): void {
  const count = options.value.length;
  active.value = ((index % count) + count) % count;
  scrollActiveIntoView();
}

async function show(): Promise<void> {
  if (open.value) return;
  active.value = selected.value;
  place();
  shift.value = 0;
  open.value = true;
  await nextTick();
  fitInWindow();
  list.value?.focus();
  scrollActiveIntoView();
}

/** Closes the list; focus goes back to the pill if it was inside */
function close(): void {
  if (!open.value) return;
  open.value = false;
  const focused = root.value?.ownerDocument.activeElement;
  if (focused && root.value?.contains(focused)) trigger.value?.focus();
}

function toggle(): void {
  if (open.value) close();
  else void show();
}

function choose(index: number): void {
  const option = options.value[index];
  if (!option) return;
  settings.targetLanguage = option.code;
  close();
}

/** Jumps to the next option whose name starts with what was typed */
function typeAhead(char: string): void {
  clearTimeout(typedTimer);
  typed += char.toLocaleLowerCase(locale.value);
  typedTimer = setTimeout(() => (typed = ''), TYPEAHEAD_MS);
  const count = options.value.length;
  const from = typed.length === 1 ? active.value + 1 : active.value;
  for (let step = 0; step < count; step++) {
    const index = (from + step) % count;
    const label = options.value[index]?.label.toLocaleLowerCase(locale.value) ?? '';
    if (label.startsWith(typed)) {
      moveTo(index);
      return;
    }
  }
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  void show();
}

function onListKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveTo(active.value + 1);
      return;
    case 'ArrowUp':
      event.preventDefault();
      moveTo(active.value - 1);
      return;
    case 'Home':
      event.preventDefault();
      moveTo(0);
      return;
    case 'End':
      event.preventDefault();
      moveTo(options.value.length - 1);
      return;
    case 'Enter':
    case ' ':
      event.preventDefault();
      choose(active.value);
      return;
    case 'Tab':
      close();
      return;
    default:
      if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        typeAhead(event.key);
      }
  }
}

useDismiss(root, open, close);
onBeforeUnmount(() => clearTimeout(typedTimer));
</script>

<template>
  <div
    ref="root"
    class="lang"
    :class="{ 'lang--compact': compact, 'lang--prominent': prominent, 'lang--open': open }"
  >
    <span v-if="!compact" :id="`${id}-label`" class="lang__label">{{ t('language.label') }}</span>
    <button
      ref="trigger"
      type="button"
      class="lang__trigger"
      :title="t('language.label')"
      :aria-label="compact ? `${t('language.label')}: ${current}` : undefined"
      :aria-labelledby="compact ? undefined : `${id}-label ${id}-value`"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span v-if="prominent" class="lang__globe" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path
            d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"
          />
        </svg>
      </span>
      <span :id="`${id}-value`" class="lang__value">{{ compact ? code : current }}</span>
      <svg class="lang__caret" viewBox="0 0 12 12" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" />
      </svg>
    </button>

    <Transition name="pop">
      <ul
        v-if="open"
        :id="`${id}-list`"
        ref="list"
        class="lang__list"
        :class="`lang__list--${side}`"
        :style="{ maxHeight: `${maxHeight}px`, translate: shift ? `${shift}px 0` : undefined }"
        role="listbox"
        tabindex="-1"
        :aria-label="t('language.label')"
        :aria-activedescendant="optionId(active)"
        @keydown="onListKeydown"
      >
        <li
          v-for="(option, index) in options"
          :id="optionId(index)"
          :key="option.code"
          class="lang__option"
          :class="{
            'lang__option--active': index === active,
            'lang__option--original': option.code === ORIGINAL_LANGUAGE,
          }"
          :data-index="index"
          role="option"
          :aria-selected="index === selected"
          @pointermove="active = index"
          @click="choose(index)"
        >
          <span class="lang__name">{{ option.label }}</span>
          <svg v-if="index === selected" class="lang__check" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2.5 6.5 2.5 2.5 4.5-5" />
          </svg>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.lang {
  position: relative;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13.5px;

  &__label {
    color: var(--muted);
  }

  &__trigger {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 6px 10px 6px 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: var(--panel);
    color: var(--fg);
    font: 500 13.5px var(--font-ui);
    cursor: pointer;
    appearance: none;
    transition:
      border-color 0.12s,
      background 0.12s,
      box-shadow 0.12s;

    &:hover {
      border-color: var(--subtle);
      background: var(--panel-2);
    }

    &:focus-visible {
      border-color: var(--accent);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &--open &__trigger {
    border-color: var(--accent);
    box-shadow: var(--shadow-focus);
  }

  &__caret {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
    opacity: 0.6;
    transition: transform 0.2s var(--ease-out);
  }

  &--open &__caret {
    transform: rotate(180deg);
  }

  // The list floats under the pill: a card with the options, scrolling past its height
  &__list {
    position: absolute;
    right: 0;
    z-index: 20;
    width: max-content;
    min-width: max(100%, 220px);

    // Never wider than a phone screen: a long name wraps instead
    max-width: calc(100vw - 24px);
    margin: 0;
    padding: 6px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--panel);
    box-shadow: var(--shadow-lg);
    list-style: none;
    overscroll-behavior: contain;

    &:focus {
      outline: none;
    }

    &--below {
      top: calc(100% + 6px);
      transform-origin: top right;
    }

    &--above {
      bottom: calc(100% + 6px);
      transform-origin: bottom right;
    }
  }

  &__option {
    position: relative;
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    color: var(--fg);
    overflow-wrap: anywhere;
    cursor: pointer;

    &--active {
      background: var(--hover);
    }

    // The chosen language: tinted, in the accent and bold, with its tick
    &[aria-selected='true'] {
      background: var(--accent-selected);
      color: var(--fg);
      font-weight: 700;
    }

    &[aria-selected='true'].lang__option--active {
      box-shadow: inset 0 0 0 1px var(--accent);
    }

    // "Don't translate" is not a language: a hairline sets it apart from the list
    &--original {
      margin-bottom: 7px;
      color: var(--muted);

      &::after {
        position: absolute;
        inset: auto 4px -4px;
        height: 1px;
        background: var(--line-soft);
        content: '';
      }
    }
  }

  &__check {
    flex: none;
    width: 12px;
    height: 12px;
    fill: none;
    stroke: var(--accent-text);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  // The start screen's field: a title like the cards' own, then a wide, tall field
  // with a globe badge and the language large; the list opens as wide as the field
  &--prominent {
    display: grid;
    gap: 10px;
    font-size: 14px;

    .lang__label {
      color: var(--fg);
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .lang__trigger {
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 8px 16px 8px 8px;
      border-radius: var(--radius);
      box-shadow: var(--shadow-xs);
      font-size: 16px;
      font-weight: 600;
      text-align: start;
    }

    .lang__value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lang__caret {
      width: 14px;
      height: 14px;
      opacity: 0.7;
    }

    .lang__list {
      right: 0;
      left: 0;
      width: auto;
      min-width: 0;
      max-width: none;
    }

    .lang__option {
      padding: 9px 12px;
      font-size: 14px;
    }
  }

  &__globe {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-text);

    svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.6;
    }
  }

  // Inside the caption bar's language pill: just the code and a caret, list in the glass colours
  &--compact {
    gap: 0;
    font: inherit;

    .lang__trigger {
      gap: 2px;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
    }

    .lang__trigger:focus-visible,
    &.lang--open .lang__trigger {
      box-shadow: none;
      text-decoration: underline;
    }

    .lang__list {
      right: auto;
      left: -10px;
      min-width: 220px;
      border-color: var(--glass-line);
      background: rgb(var(--glass-rgb) / 97%);
      color: var(--glass-fg);
      box-shadow: 0 24px 60px rgb(0 0 0 / 45%);
      font: 500 13px var(--font-ui);
      letter-spacing: 0;
      backdrop-filter: blur(24px) saturate(1.5);
    }

    .lang__option {
      color: var(--glass-fg);

      &--active {
        background: var(--glass-hover);
      }

      &[aria-selected='true'] {
        background: color-mix(in srgb, var(--glass-accent) 30%, transparent);
        color: var(--glass-fg);
      }

      &--original {
        color: var(--glass-muted);

        &::after {
          background: var(--glass-line);
        }
      }
    }

    .lang__check {
      stroke: var(--glass-accent);
    }
  }
}
</style>
