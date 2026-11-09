import { describe, expect, it } from 'vitest';
import { guessLanguage } from './textLanguage';

describe('guessLanguage', () => {
  it('tells two languages written alike apart by their common words', () => {
    expect(guessLanguage('Hello, where is the train station?', ['es', 'en'])).toBe('en');
    expect(guessLanguage('Está a dos calles, al final de esta avenida.', ['es', 'en'])).toBe('es');
    expect(guessLanguage('Thank you so much. Is it far to walk?', ['es', 'en'])).toBe('en');
    expect(guessLanguage('No, son cinco minutos andando.', ['es', 'en'])).toBe('es');
    expect(guessLanguage('Je ne sais pas où est la gare', ['fr', 'en'])).toBe('fr');
    expect(guessLanguage('Ich weiß nicht, wo der Bahnhof ist', ['de', 'en'])).toBe('de');
  });

  it('places everyday sentences of a Spanish–English conversation, and never swaps them', () => {
    const spanish = [
      'Buenas tardes, ¿en qué puedo ayudarle?',
      'Está a dos calles.',
      'Sí, claro, ahora mismo se lo traigo.',
      'Son veinte euros con cincuenta.',
      'Tengo una reserva a nombre de García.',
      'Perdone, no le he entendido bien.',
    ];
    const english = [
      'Good afternoon, I have a reservation.',
      "I'm looking for the nearest pharmacy.",
      'Can I pay by card?',
      'It was a very long flight.',
      "Sorry, I don't speak Spanish.",
      'Could you write it down for me, please?',
    ];
    const placed = (lines: string[]): (string | null)[] =>
      lines.map((line) => guessLanguage(line, ['es', 'en']));
    expect(placed(spanish).filter((code) => code === 'en')).toEqual([]);
    expect(placed(english).filter((code) => code === 'es')).toEqual([]);
    // Most are placed outright; the rest go to the transcriber or the translator
    expect(placed(spanish).filter((code) => code === 'es').length).toBeGreaterThanOrEqual(5);
    expect(placed(english).filter((code) => code === 'en').length).toBeGreaterThanOrEqual(5);
  });

  it('counts letters only one of the two languages uses', () => {
    expect(guessLanguage('¿Mañana?', ['es', 'en'])).toBe('es');
    expect(guessLanguage('Straße', ['de', 'en'])).toBe('de');
  });

  it('tells languages in different scripts apart by the script', () => {
    expect(guessLanguage('Где вокзал?', ['es', 'ru'])).toBe('ru');
    expect(guessLanguage('¿Dónde está?', ['es', 'ru'])).toBe('es');
    expect(guessLanguage('駅はどこですか', ['ja', 'en'])).toBe('ja');
    expect(guessLanguage('火车站在哪里', ['zh', 'ja'])).toBe('zh');
    expect(guessLanguage('역이 어디예요?', ['ko', 'en'])).toBe('ko');
    expect(guessLanguage('المحطة', ['ar', 'fr'])).toBe('ar');
  });

  it('stays unknown when the words could be either', () => {
    expect(guessLanguage('Taxi', ['es', 'en'])).toBeNull();
    expect(guessLanguage('No', ['es', 'en'])).toBeNull();
    expect(guessLanguage('Hotel Central', ['es', 'en'])).toBeNull();
    expect(guessLanguage('', ['es', 'en'])).toBeNull();
  });

  it('needs two different languages to choose from', () => {
    expect(guessLanguage('Hello there', ['en'])).toBeNull();
    expect(guessLanguage('Hello there', ['en', 'en-US'])).toBeNull();
  });

  it('reads region tags as their language', () => {
    expect(guessLanguage('Where is the station?', ['es-ES', 'en-GB'])).toBe('en');
  });
});
