// The landing page is written in English; this swaps in Spanish for Spanish readers, or
// when the reader asks for it. The choice is remembered in this browser.

type Texts = Readonly<Record<string, string>>;

const STORAGE_KEY = 'neboki-landing-lang';

const ES: Texts = {
  open: 'Abrir la app',
  code: 'Ver el código',
  title: 'Entiende cualquier conversación, en cualquier idioma, en directo.',
  lead: 'Subtítulos traducidos para llamadas, vídeos y reuniones en persona, un segundo después de cada frase.',
  note: 'Gratis y de código abierto · Con tu propia clave de OpenAI · Desde ≈ 0,24 $ la hora',
  live: 'En directo',
  whereTitle: 'Dónde funciona',
  computerTitle: 'En el ordenador',
  computerText:
    'Zoom, Teams, Meet, YouTube, webinars. Los subtítulos flotan en una ventana encima de todo, o se quedan en la app.',
  roomTitle: 'En la sala',
  roomText:
    'Reuniones, entrevistas, clases. Deja el móvil o el portátil en la mesa y lee: escucha por el micrófono.',
  hybridTitle: 'Las dos a la vez',
  hybridText: 'La llamada y la sala juntas: la pestaña compartida y el micrófono, mezclados.',
  getTitle: 'Qué te da',
  get1Title: 'Sigue la conversación.',
  get1: 'La traducción, con el original debajo si lo quieres, o en voz alta.',
  get2Title: 'Participa.',
  get2: 'Qué podrías responder y qué podrías preguntar, en tu idioma y en el suyo.',
  get3Title: 'Olvídate de tomar notas.',
  get3: 'Un resumen en directo, y la conversación entera para exportar.',
  get4Title: 'Acierta con los nombres.',
  get4: 'Un glosario de nombres y términos que no se deben traducir.',
  get5Title: 'Controla la factura.',
  get5: 'Una estimación del coste en directo y un límite de gasto por sesión.',
  trustTitle: 'Por qué puedes fiarte',
  trust1Title: 'Sin servidor en medio',
  trust1: 'Tu navegador envía el audio directo a OpenAI. Nada pasa por nosotros.',
  trust2Title: 'Tu clave es solo tuya',
  trust2: 'Se guarda en tu navegador, y solo si eliges recordarla.',
  trust3Title: 'Código abierto',
  trust3: 'Todo el código es público: cualquiera puede comprobar qué hace. Sin analítica.',
  stepsTitle: 'Empieza en tres pasos',
  step1: 'Consigue una clave de la API de OpenAI (o usa el Azure OpenAI de tu empresa).',
  step2: 'Abre la app, elige tu idioma y qué escuchar.',
  step3: 'Pulsa Empezar, y a leer.',
  license: 'Código abierto con licencia AGPL-3.0',
  appLink: 'App',
  privacy: 'Privacidad',
};

/** The English text of every element, read once from the page as written */
const english = new Map<Element, string>();

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked (private windows, strict settings): the page still works
    return null;
  }
}

function store(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not remembered, nothing else lost
  }
}

function prefersSpanish(): boolean {
  const stored = readStored();
  if (stored === 'es' || stored === 'en') return stored === 'es';
  return (navigator.languages ?? [navigator.language]).some((tag) =>
    tag.toLowerCase().startsWith('es'),
  );
}

function apply(spanish: boolean): void {
  document.documentElement.lang = spanish ? 'es' : 'en';
  for (const element of document.querySelectorAll('[data-t]')) {
    if (!english.has(element)) english.set(element, element.textContent ?? '');
    const key = element.getAttribute('data-t') ?? '';
    element.textContent = spanish
      ? (ES[key] ?? english.get(element) ?? '')
      : (english.get(element) ?? '');
  }
  const toggle = document.querySelector('[data-lang-toggle]');
  if (toggle) {
    toggle.textContent = spanish ? 'EN' : 'ES';
    toggle.setAttribute('aria-label', spanish ? 'English' : 'Español');
  }
}

let spanish = prefersSpanish();
apply(spanish);
document.querySelector('[data-lang-toggle]')?.addEventListener('click', () => {
  spanish = !spanish;
  store(spanish ? 'es' : 'en');
  apply(spanish);
});
