// The WAI-ARIA radio pattern for a group of role="radio" buttons: the arrow keys move the
// choice, and only the chosen one is in the tab order.

const STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/** On the radiogroup: an arrow key focuses and chooses the next (or previous) radio. */
export function onRadioKeydown(event: KeyboardEvent): void {
  const step = STEPS[event.key];
  const target = event.target as HTMLElement | null;
  if (step === undefined || !target) return;
  // No instanceof: inside the floating window nodes belong to another window
  const group = target.closest('[role="radiogroup"]');
  if (!group) return;
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])')];
  const index = radios.indexOf(target);
  if (index < 0) return;
  event.preventDefault();
  const next = radios[(index + step + radios.length) % radios.length];
  next?.focus();
  next?.click();
}

/** Only the chosen radio is reached with Tab; with none chosen, the first one is. */
export function radioTabIndex(checked: boolean, first: boolean, anyChecked: boolean): 0 | -1 {
  return checked || (!anyChecked && first) ? 0 : -1;
}
