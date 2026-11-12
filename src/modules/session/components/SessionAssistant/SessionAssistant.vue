<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AssistantTurn } from '../../composables/useSessionAi';
import { sessionFilename } from '../../composables/useExportSession';
import { ASSISTANT_ACTIONS, type AssistantAction } from '../../utils/assistantActions';
import { copyText } from '../../utils/copyText';
import { downloadText } from '../../utils/download';

/**
 * The assistant of a conversation: ready-made requests with one press (minutes, notes,
 * tasks, an email) and a field to ask anything about what was said. The latest answer
 * is right under the field; each can be copied or downloaded.
 */
const props = defineProps<{
  turns: readonly AssistantTurn[];
  asking: boolean;
  /** When the conversation began, to name the downloads after it */
  startedAt: number | null;
}>();
const emit = defineEmits<{ ask: [request: string, label: string]; stop: [] }>();

const COPIED_MS = 1800;

const { t } = useI18n();
const question = ref('');
const copiedId = ref<number | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Newest first: what was just asked is next to where it was asked */
const shown = computed(() => [...props.turns].reverse());

function run(action: AssistantAction): void {
  emit('ask', action.request, t(action.label));
}

function send(): void {
  const text = question.value.trim();
  if (!text || props.asking) return;
  emit('ask', text, text);
  question.value = '';
}

/** Enter sends; Shift+Enter is a new line */
function onEnter(event: KeyboardEvent): void {
  if (event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send();
}

async function copy(turn: AssistantTurn): Promise<void> {
  if (!(await copyText(turn.answer))) return;
  copiedId.value = turn.id;
  clearTimeout(timer);
  timer = setTimeout(() => (copiedId.value = null), COPIED_MS);
}

function download(turn: AssistantTurn): void {
  if (props.startedAt === null) return;
  const name = sessionFilename(props.startedAt, `-${turn.id}.md`);
  downloadText(name, `# ${turn.label}\n\n${turn.answer}\n`);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <section class="assistant">
    <ul class="assistant__actions" :aria-label="t('session.view.assistant.ready')">
      <li v-for="action in ASSISTANT_ACTIONS" :key="action.id">
        <button type="button" :disabled="asking" @click="run(action)">
          {{ t(action.label) }}
        </button>
      </li>
    </ul>

    <form class="assistant__form" @submit.prevent="send">
      <textarea
        v-model="question"
        class="assistant__field"
        rows="2"
        :placeholder="t('session.view.assistant.placeholder')"
        :aria-label="t('session.view.assistant.placeholder')"
        @keydown.enter="onEnter"
        @keydown.esc.stop
      />
      <button v-if="asking" class="lg-btn assistant__send" type="button" @click="emit('stop')">
        {{ t('session.view.assistant.stop') }}
      </button>
      <button v-else class="lg-btn assistant__send" type="submit" :disabled="!question.trim()">
        {{ t('session.view.assistant.send') }}
      </button>
    </form>

    <p v-if="!turns.length" class="assistant__hint">{{ t('session.view.assistant.hint') }}</p>

    <ol v-else class="assistant__turns" aria-live="polite">
      <li v-for="turn in shown" :key="turn.id" class="assistant__turn">
        <h3 class="assistant__asked">{{ turn.label }}</h3>
        <p v-if="turn.answer" class="assistant__answer">{{ turn.answer }}</p>
        <p v-if="turn.status === 'writing'" class="assistant__state">
          {{ t('session.view.assistant.writing') }}
        </p>
        <p v-else-if="turn.status === 'failed'" class="assistant__state assistant__state--failed">
          {{ t('session.view.assistant.failed') }}
        </p>
        <div v-if="turn.answer && turn.status !== 'writing'" class="assistant__tools">
          <button type="button" @click="copy(turn)">
            {{ copiedId === turn.id ? t('session.view.copied') : t('session.view.copy') }}
          </button>
          <button type="button" @click="download(turn)">
            {{ t('session.view.download') }}
          </button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped lang="scss">
.assistant {
  display: grid;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-xs);

  &__actions,
  &__turns {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    button {
      padding: 4px 12px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--fg);
      font: 500 12.5px var(--font-ui);
      cursor: pointer;

      &:hover:not(:disabled) {
        border-color: var(--accent);
        color: var(--accent);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--shadow-focus);
      }
    }
  }

  &__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: end;
  }

  &__field {
    min-height: 54px;
    padding: 8px 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--panel-2);
    color: var(--fg);
    font: 13.5px/1.45 var(--font-ui);
    resize: vertical;

    &:focus-visible {
      border-color: var(--accent);
      outline: none;
      box-shadow: var(--shadow-focus);
    }
  }

  &__hint,
  &__state {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  &__state--failed {
    color: var(--danger);
  }

  &__turns {
    display: grid;
    gap: 16px;
  }

  &__turn {
    display: grid;
    gap: 6px;
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
  }

  &__asked {
    margin: 0;
    color: var(--accent);
    font-size: 12.5px;
    font-weight: 600;
  }

  // The model writes plain text with its own line breaks and "- " lists
  &__answer {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  &__tools {
    display: flex;
    gap: 14px;

    button {
      padding: 2px 0;
      border: 0;
      background: transparent;
      color: var(--accent);
      font: 500 12.5px var(--font-ui);
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }

      &:focus-visible {
        border-radius: var(--radius-sm);
        outline: none;
        box-shadow: var(--shadow-focus);
      }
    }
  }
}
</style>
