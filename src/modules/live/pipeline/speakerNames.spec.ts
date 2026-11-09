import { describe, expect, it } from 'vitest';
import { introducedName } from './speakerNames';

describe('introducedName', () => {
  it.each([
    ['Hola, soy Ana y llevo el proyecto.', 'Ana'],
    ['Buenos días. Me llamo José Luis.', 'José Luis'],
    ['Hi everyone, my name is Jim.', 'Jim'],
    ["I'm Sarah, from the sales team.", 'Sarah'],
    ["Bonjour, je m'appelle Claire.", 'Claire'],
    ['Guten Tag, ich bin Jonas.', 'Jonas'],
  ])('finds the name in %s', (text, name) => {
    expect(introducedName(text)).toBe(name);
  });

  it.each([
    'Soy ingeniero de caminos.',
    "I'm fine, thanks.",
    'I am The one who called.',
    'Personas que soy capaz de ver.',
    'Hablamos con Ana mañana.',
  ])('names nobody in %s', (text) => {
    expect(introducedName(text)).toBeNull();
  });
});
