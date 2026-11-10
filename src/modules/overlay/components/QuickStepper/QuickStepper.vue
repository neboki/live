<script setup lang="ts">
/**
 * An icon with − and + beside it: volume and text size work the same way, so learning
 * one teaches the other. The icon is a button only when it toggles something (the
 * voice); every part has a tooltip and a name for screen readers.
 */
withDefaults(
  defineProps<{
    /** Name of the whole control, shown beside the icon when there is room */
    label: string;
    downLabel: string;
    upLabel: string;
    canDown?: boolean;
    canUp?: boolean;
    /** The current value, as the user reads it ("100 %") */
    value: string;
    /** Tooltip of the icon when it is a switch; leave out for a plain icon */
    toggleLabel?: string;
    /** State of the switch */
    pressed?: boolean;
    /** Show the label next to the icon (the bar in the page) */
    named?: boolean;
  }>(),
  { canDown: true, canUp: true, toggleLabel: undefined, pressed: false },
);

const emit = defineEmits<{ toggle: []; down: []; up: [] }>();
</script>

<template>
  <div
    class="stepper"
    role="group"
    :aria-label="`${label}: ${value}`"
    :title="`${label}: ${value}`"
  >
    <button
      v-if="toggleLabel"
      class="stepper__icon"
      type="button"
      :title="toggleLabel"
      :aria-label="toggleLabel"
      :aria-pressed="pressed"
      @click="emit('toggle')"
    >
      <slot />
    </button>
    <span v-else class="stepper__icon stepper__icon--static" aria-hidden="true"><slot /></span>
    <span v-if="named" class="stepper__label" aria-hidden="true">{{ label }}</span>
    <button
      class="stepper__step"
      type="button"
      :disabled="!canDown"
      :title="downLabel"
      :aria-label="downLabel"
      @click="emit('down')"
    >
      −
    </button>
    <span class="stepper__value" aria-hidden="true">{{ value }}</span>
    <button
      class="stepper__step"
      type="button"
      :disabled="!canUp"
      :title="upLabel"
      :aria-label="upLabel"
      @click="emit('up')"
    >
      +
    </button>
  </div>
</template>

<style scoped lang="scss">
// One pill holding icon, − value +: lit by the bar's theme like the round buttons
.stepper {
  display: inline-flex;
  gap: 2px;
  align-items: center;
  height: 30px;
  padding: 0 3px;
  border-radius: var(--radius-pill);
  background: rgb(255 255 255 / 4%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 85%);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;

  @media (pointer: coarse) {
    height: 36px;
  }

  &__icon,
  &__step {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    appearance: none;
    transition:
      background 0.2s,
      color 0.15s;

    @media (pointer: coarse) {
      width: 30px;
      height: 30px;
    }

    &:hover:not(:disabled) {
      background: rgb(var(--tint-a) / 35%);
      color: #fff;
    }

    &:focus-visible {
      outline: 2px solid rgb(var(--tint-b));
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.35;
      cursor: default;
    }
  }

  &__icon[aria-pressed='true'] {
    background: linear-gradient(135deg, rgb(var(--tint-a)), rgb(var(--tint-b)));
    color: #fff;
  }

  &__icon--static {
    cursor: default;
  }

  &__step {
    font-size: 15px;
    font-weight: 700;
  }

  &__label {
    padding: 0 2px;
  }

  &__value {
    min-width: 3.4em;
    color: var(--glass-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  :slotted(svg) {
    width: 14px;
    height: 14px;
  }
}
</style>
