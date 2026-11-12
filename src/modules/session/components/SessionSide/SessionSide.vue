<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AssistantTurn } from '../../composables/useSessionAi';
import { copyText } from '../../utils/copyText';
import SessionAssistant from '../SessionAssistant/SessionAssistant.vue';

type Tab = 'summary' | 'assistant';

/**
 * Beside the transcript: the key points, ready to copy or to write again, and the terms,
 * each a search. With a key of their own, the person also gets the assistant in a second
 * tab.
 */
const props = defineProps<{
  summary: readonly string[];
  terms: readonly string[];
  /** The assistant can be used (the person has a key of their own) */
  assistant: boolean;
  /** The summary can be written, or written again */
  canSummarize: boolean;
  summarizing: boolean;
  turns: readonly AssistantTurn[];
  asking: boolean;
  startedAt: number | null;
}>();
const emit = defineEmits<{
  term: [term: string];
  summarize: [];
  ask: [request: string, label: string];
  stop: [];
}>();

const TABS: readonly Tab[] = ['summary', 'assistant'];
const COPIED_MS = 1800;

const { t } = useI18n();
const tab = ref<Tab>('summary');
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copySummary(): Promise<void> {
  const ok = await copyText(props.summary.map((point) => `- ${point}`).join('\n'));
  if (!ok) return;
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), COPIED_MS);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <aside class="side">
    <div v-if="assistant" class="side__tabs" role="tablist">
      <button
        v-for="name in TABS"
        :id="`session-tab-${name}`"
        :key="name"
        class="side__tab"
        type="button"
        role="tab"
        :aria-selected="tab === name"
        :aria-controls="`session-panel-${name}`"
        @click="tab = name"
      >
        {{ t(`session.view.tabs.${name}`) }}
      </button>
    </div>

    <div
      v-show="!assistant || tab === 'summary'"
      id="session-panel-summary"
      class="side__panel"
      :role="assistant ? 'tabpanel' : undefined"
      :aria-labelledby="assistant ? 'session-tab-summary' : undefined"
    >
      <section v-if="summary.length || canSummarize" class="side__card">
        <div class="side__head">
          <h2 class="lg-label">{{ t('session.md.summary') }}</h2>
          <div v-if="summary.length" class="side__links">
            <button type="button" @click="copySummary">
              <span aria-live="polite">
                {{ copied ? t('session.view.copied') : t('session.view.copy') }}
              </span>
            </button>
            <button
              v-if="canSummarize"
              type="button"
              :disabled="summarizing"
              :title="t('session.view.aiCost')"
              @click="emit('summarize')"
            >
              {{ summarizing ? t('session.view.creatingSummary') : t('session.view.regenerate') }}
            </button>
          </div>
        </div>
        <ul v-if="summary.length" class="side__points" :aria-busy="summarizing">
          <li v-for="(point, i) in summary" :key="i">{{ point }}</li>
        </ul>
        <template v-else>
          <p class="side__empty">{{ t('session.view.noSummary') }}</p>
          <button
            class="lg-btn side__create"
            type="button"
            :disabled="summarizing"
            :title="t('session.view.aiCost')"
            @click="emit('summarize')"
          >
            {{ summarizing ? t('session.view.creatingSummary') : t('session.view.createSummary') }}
          </button>
        </template>
      </section>
      <section v-if="terms.length" class="side__card">
        <h2 class="lg-label">{{ t('session.md.glossary') }}</h2>
        <ul class="side__terms">
          <li v-for="term in terms" :key="term">
            <button
              type="button"
              :title="t('session.view.searchTerm', { term })"
              @click="emit('term', term)"
            >
              {{ term }}
            </button>
          </li>
        </ul>
      </section>
    </div>

    <div
      v-if="assistant"
      v-show="tab === 'assistant'"
      id="session-panel-assistant"
      class="side__panel"
      role="tabpanel"
      aria-labelledby="session-tab-assistant"
    >
      <SessionAssistant
        :turns="turns"
        :asking="asking"
        :started-at="startedAt"
        @ask="(request, label) => emit('ask', request, label)"
        @stop="emit('stop')"
      />
      <p class="side__cost">{{ t('session.view.aiCost') }}</p>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.side {
  display: grid;
  gap: 12px;
  align-content: start;

  // Two quiet tabs: the one in use is underlined in the accent colour
  &__tabs {
    display: flex;
    gap: 18px;
    padding: 0 4px;
    border-bottom: 1px solid var(--line);
  }

  &__tab {
    margin-bottom: -1px;
    padding: 6px 0 8px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--muted);
    font: 600 13px var(--font-ui);
    cursor: pointer;

    &:hover {
      color: var(--fg);
    }

    &[aria-selected='true'] {
      border-bottom-color: var(--accent);
      color: var(--fg);
    }

    &:focus-visible {
      border-radius: var(--radius-sm);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &__panel {
    display: grid;
    gap: 16px;
    align-content: start;
  }

  &__card {
    display: grid;
    gap: 12px;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow-xs);

    h2 {
      margin: 0;
    }
  }

  &__head {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }

  &__links {
    display: flex;
    gap: 14px;

    button {
      padding: 2px 0;
      border: 0;
      background: transparent;
      color: var(--accent);
      font: 500 12.5px var(--font-ui);
      cursor: pointer;

      &:hover:not(:disabled) {
        text-decoration: underline;
      }

      &:disabled {
        color: var(--muted);
        cursor: default;
      }

      &:focus-visible {
        border-radius: var(--radius-sm);
        outline: none;
        box-shadow: var(--shadow-focus);
      }
    }
  }

  &__points,
  &__terms {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__points {
    display: grid;
    gap: 8px;
    font-size: 13.5px;
    transition: opacity 0.15s ease;

    &[aria-busy='true'] {
      opacity: 0.5;
    }

    li {
      padding-left: 12px;
      border-left: 2px solid var(--accent);
    }
  }

  &__empty,
  &__cost {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__cost {
    padding: 0 4px;
  }

  &__create {
    justify-self: start;
  }

  &__terms {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    button {
      padding: 2px 10px;
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      background: var(--panel-2);
      color: var(--fg);
      font: 12.5px var(--font-ui);
      cursor: pointer;

      &:hover {
        border-color: var(--accent);
        color: var(--accent);
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--shadow-focus);
      }
    }
  }
}
</style>
