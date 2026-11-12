<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

export type DownloadKind = 'markdown' | 'srt' | 'vtt' | 'file';

/** One Download button that opens the formats a conversation can leave in. */
defineProps<{
  /** A download just left: the button says so for a moment */
  saved: boolean;
}>();
const emit = defineEmits<{ pick: [kind: DownloadKind] }>();

/** What each format is for, in the order a reader most likely wants them */
const KINDS: readonly { kind: DownloadKind; label: string; hint: string }[] = [
  { kind: 'markdown', label: 'session.view.markdown', hint: 'session.view.markdownHint' },
  { kind: 'srt', label: 'session.view.srt', hint: 'session.view.subtitlesHint' },
  { kind: 'vtt', label: 'session.view.vtt', hint: 'session.view.subtitlesHint' },
  { kind: 'file', label: 'session.view.file', hint: 'session.view.fileHint' },
];

const { t } = useI18n();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const toggle = ref<HTMLButtonElement | null>(null);

function pick(kind: DownloadKind): void {
  open.value = false;
  emit('pick', kind);
  toggle.value?.focus();
}

/** Escape closes the menu only; closed already, it reaches the view, which closes. */
function onEscape(event: KeyboardEvent): void {
  if (!open.value) return;
  event.stopPropagation();
  open.value = false;
  toggle.value?.focus();
}

function onPointerDown(event: PointerEvent): void {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false;
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && !root.value?.contains(next)) open.value = false;
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
  <div ref="root" class="download" @keydown.esc="onEscape" @focusout="onFocusOut">
    <button
      ref="toggle"
      class="lg-btn download__toggle"
      type="button"
      aria-haspopup="menu"
      aria-controls="session-download-menu"
      :aria-expanded="open"
      @click="open = !open"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" />
      </svg>
      <span aria-live="polite">
        {{ saved ? t('session.view.saved') : t('session.view.download') }}
      </span>
    </button>
    <ul v-show="open" id="session-download-menu" class="download__menu" role="menu">
      <li v-for="item in KINDS" :key="item.kind" role="none">
        <button class="download__item" type="button" role="menuitem" @click="pick(item.kind)">
          <span>{{ t(item.label) }}</span>
          <small>{{ t(item.hint) }}</small>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.download {
  position: relative;

  &__toggle {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;

    &:hover:not(:disabled) {
      border-color: var(--accent-strong);
      background: var(--accent-strong);
      color: #fff;
    }

    svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.6;
    }
  }

  &__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    display: grid;
    gap: 2px;
    width: max-content;
    max-width: min(300px, calc(100vw - 32px));
    margin: 0;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-lg);
    list-style: none;
  }

  &__item {
    display: grid;
    gap: 1px;
    width: 100%;
    padding: 8px 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg);
    font: 500 13px var(--font-ui);
    text-align: left;
    cursor: pointer;

    small {
      color: var(--subtle);
      font-size: 11.5px;
      font-weight: 400;
    }

    &:hover,
    &:focus-visible {
      background: var(--panel-2);
      outline: none;
    }
  }
}
</style>
