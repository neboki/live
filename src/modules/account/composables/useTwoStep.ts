import { onBeforeUnmount, ref, type Ref } from 'vue';

/** How long an armed button waits for its confirming second click */
export const CONFIRM_MS = 5000;

export interface TwoStep {
  /** True between the first click and the confirming one */
  armed: Ref<boolean>;
  /** First click arms; a second one within CONFIRM_MS runs `action` */
  press: () => void;
}

/** Two clicks, no dialog: for actions that cannot be undone, like deleting */
export function useTwoStep(action: () => unknown): TwoStep {
  const armed = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function press(): void {
    clearTimeout(timer);
    if (!armed.value) {
      armed.value = true;
      timer = setTimeout(() => (armed.value = false), CONFIRM_MS);
      return;
    }
    armed.value = false;
    void action();
  }

  onBeforeUnmount(() => clearTimeout(timer));
  return { armed, press };
}
