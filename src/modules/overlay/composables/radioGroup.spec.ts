import { describe, expect, it } from 'vitest';
import { onRadioKeydown, radioTabIndex } from './radioGroup';

function group(): { radios: HTMLButtonElement[]; chosen: string[] } {
  const chosen: string[] = [];
  const root = document.createElement('div');
  root.setAttribute('role', 'radiogroup');
  const radios = ['a', 'b', 'c'].map((name) => {
    const button = document.createElement('button');
    button.setAttribute('role', 'radio');
    button.textContent = name;
    button.addEventListener('click', () => chosen.push(name));
    root.append(button);
    return button;
  });
  document.body.append(root);
  return { radios, chosen };
}

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('onRadioKeydown', () => {
  it('moves the choice with the arrow keys, wrapping around', () => {
    const { radios, chosen } = group();
    radios.forEach((radio) => radio.addEventListener('keydown', onRadioKeydown));

    expect(press(radios[0] as HTMLElement, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(radios[1]);
    press(radios[2] as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(radios[0]);
    press(radios[0] as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(radios[2]);
    expect(chosen).toEqual(['b', 'a', 'c']);
  });

  it('leaves other keys alone', () => {
    const { radios, chosen } = group();
    radios.forEach((radio) => radio.addEventListener('keydown', onRadioKeydown));

    expect(press(radios[0] as HTMLElement, 'Enter').defaultPrevented).toBe(false);
    expect(chosen).toEqual([]);
  });
});

describe('radioTabIndex', () => {
  it('keeps only the chosen radio, or else the first, in the tab order', () => {
    expect(radioTabIndex(true, false, true)).toBe(0);
    expect(radioTabIndex(false, true, true)).toBe(-1);
    expect(radioTabIndex(false, true, false)).toBe(0);
    expect(radioTabIndex(false, false, false)).toBe(-1);
  });
});
