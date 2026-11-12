/** What the assistant does with one press: the request is the same whatever the app's language */
export interface AssistantAction {
  id: 'minutes' | 'notes' | 'tasks' | 'email';
  /** i18n key of its name on the button */
  label: string;
  /** What the model is asked; it answers in the reader's language */
  request: string;
}

export const ASSISTANT_ACTIONS: readonly AssistantAction[] = [
  {
    id: 'minutes',
    label: 'session.view.assistant.actions.minutes',
    request:
      'Write the minutes of this meeting: the topics discussed, what was decided on each, the tasks agreed (with who does them and by when, if said) and what was left open. Use those four as headings and leave out any that has nothing.',
  },
  {
    id: 'notes',
    label: 'session.view.assistant.actions.notes',
    request:
      'Write clear study-style notes of what was said: the main ideas in order, each with the facts, figures and examples that support it.',
  },
  {
    id: 'tasks',
    label: 'session.view.assistant.actions.tasks',
    request:
      'List every task, commitment or next step that was mentioned, one per line, with who is responsible and the deadline when they were said. If there are none, say so.',
  },
  {
    id: 'email',
    label: 'session.view.assistant.actions.email',
    request:
      'Write a short follow-up email to the people in this conversation: one line of thanks, what was agreed, the next steps with who does them, and a closing line. Include a subject line.',
  },
];
