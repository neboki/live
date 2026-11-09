// The landing page is written in English; this swaps in Spanish for Spanish readers, or
// when the reader asks for it (remembered in this browser). It also plays the caption
// demo in the hero, runs the cost calculator and formats prices for the reader's language.

type Texts = Readonly<Record<string, string>>;

interface DemoLine {
  readonly speaker: number;
  readonly who: string;
  readonly lang: string;
  readonly source: string;
  readonly en: string;
  readonly es: string;
}

const STORAGE_KEY = 'neboki-landing-lang';
const TYPE_MS = 70;
const HOLD_MS = 2600;

const ES: Texts = {
  skip: 'Ir al contenido',
  navWhere: 'Dónde funciona',
  navMobile: 'Móvil',
  navPricing: 'Precios',
  navPrivacy: 'Privacidad',
  open: 'Abrir la app',
  openFree: 'Empezar a traducir',
  seeHow: 'Ver cómo funciona',
  pill: 'Código abierto · Nada entre tú y el modelo',
  title1: 'Entiende cualquier conversación,',
  title2: 'en cualquier idioma, en directo.',
  lead: 'Subtítulos traducidos que flotan sobre tus llamadas, vídeos y reuniones, un segundo después de cada frase. En el ordenador y en el móvil.',
  factDelay: 'de la voz al subtítulo',
  factLangs: 'idiomas',
  factCost: 'la hora, en la calidad más barata',
  live: 'En directo',
  forCamille: 'Para Camille',
  heroTalkBottom: '¿Repasamos antes el calendario?',
  worksWith: 'Funciona con lo que estés escuchando',
  webinars: 'Webinars',
  podcasts: 'Podcasts',
  classes: 'Clases',
  whereEyebrow: 'Una app, cualquier situación',
  whereTitle: 'En una llamada, en la sala, o las dos a la vez',
  whereLead:
    'Elige qué escuchar: una pestaña del navegador, tu micrófono, o los dos mezclados. Lo demás es automático, incluido qué idioma habla cada persona.',
  tagTab: 'Pestaña compartida',
  tagMic: 'Micrófono',
  tagBoth: 'Pestaña + micrófono',
  computerTitle: 'En el ordenador',
  computerText:
    'Zoom, Teams, Meet, YouTube, webinars. Los subtítulos flotan en una ventanita encima de todo, así te acompañan abras lo que abras.',
  roomTitle: 'En la sala',
  roomText:
    'Reuniones, entrevistas, clases, una visita al médico. Deja el móvil o el portátil en la mesa y lee: escucha por el micrófono.',
  mixTab: 'Pestaña',
  mixMic: 'Micro',
  mixAll: 'Todos',
  hybridTitle: 'Las dos a la vez',
  hybridText:
    'Reuniones híbridas: la gente de la llamada y la de la sala, mezcladas en una sola transcripción.',
  mobileEyebrow: 'En el móvil',
  mobileTitle: 'Un intérprete de bolsillo, con tres botones grandes',
  mobileLead:
    'Añádela a la pantalla de inicio y se abre como una app. Sin tienda, sin descargas y sin cuenta.',
  listenTitle: 'Escuchar',
  listen1: 'Bienvenidos a la planta. Empezamos con la charla de seguridad.',
  listen2: 'El casco es obligatorio a partir de la línea amarilla.',
  voice2: 'Voz 2',
  listen3: '¿Hay un descanso antes de comer?',
  voiceOn: 'Voz: sí',
  stop: 'Parar',
  listenText:
    'Charlas, visitas, eventos. Lee la traducción, u óyela en los auriculares. Pone nombre a cada voz cuando la gente se presenta.',
  talkTopWho: 'Para Tom',
  talkTop: 'It leaves at 22:40, from platform 3.',
  talkBottomWho: 'Tom',
  talkBottom: '¿A qué hora sale el último tren a Bilbao?',
  talkTitle: 'Conversar',
  talkText:
    'Cara a cara, cada uno en su idioma. La pantalla se parte en dos y la mitad de arriba se gira hacia la otra persona.',
  presentLine: 'Our second quarter closed 18% above plan.',
  presentTitle: 'Presentar',
  presentText:
    'Tú hablas y la sala te sigue en su idioma: una sola línea enorme, lista para el proyector.',
  featEyebrow: 'Más que subtítulos',
  getTitle: 'Todo lo que necesitas para seguir, y para participar',
  dualT: 'Podemos sacar la primera versión en abril.',
  get1Title: 'Léelo, u óyelo',
  get1: 'La traducción, con el original debajo si lo quieres. O ponte los auriculares y una voz de intérprete te la lee.',
  voiceTitle: 'Modo intérprete',
  voiceText: 'Traduce mientras todavía están hablando, con voz propia.',
  reply: 'Responder',
  replyText: 'Abril también nos va bien.',
  ask: 'Preguntar',
  askText: '¿Qué funciones van primero?',
  get2Title: 'Participa',
  get2: 'Qué podrías responder y qué podrías preguntar, en tu idioma y en el suyo.',
  sum1: 'El lanzamiento pasa a abril',
  sum2: 'Jonas envía el presupuesto',
  sum3: 'Presupuesto aprobado',
  get3Title: 'Olvídate de tomar notas',
  get3: 'Un resumen que se escribe solo, y la conversación entera para exportar.',
  get4Title: 'Acierta con los nombres',
  get4: 'Un glosario de nombres y términos que nunca se deben traducir.',
  meterOf: 'de un límite de 3,00 $',
  get5Title: 'Controla la factura',
  get5: 'Una estimación del coste en directo, y un límite de gasto por sesión.',
  savedAccount: 'Guardada en tu cuenta',
  saveTitle: 'Quédate con lo importante',
  saveText:
    'Exporta cualquier conversación como texto, o entra con Google para guardar tu historial, solo si tú quieres.',
  howEyebrow: 'Cómo funciona',
  howTitle: 'Del sonido al subtítulo, en un segundo',
  flow1: 'Escucha',
  flow1t: 'La pestaña, el micro o los dos',
  flow2: 'Corta en frases',
  flow2t: 'En cada pausa natural',
  flow3: 'Transcribe',
  flow3t: 'Y detecta el idioma',
  flow4: 'Traduce',
  flow4t: 'Con tu glosario',
  flow5: 'Te lo muestra',
  flow5t: 'En pantalla o al oído',
  trustEyebrow: 'Privada por diseño',
  trustTitle: 'Tu navegador habla con el modelo. Nadie más escucha.',
  trust1Title: 'Sin servidor en medio.',
  trust1: 'El audio va directo de tu navegador a OpenAI. Nada pasa por nosotros.',
  trust2Title: 'Tu clave es solo tuya.',
  trust2: 'Se guarda en tu navegador, y solo si eliges recordarla.',
  trust3Title: 'Código abierto, sin analítica.',
  trust3: 'Todo el código es público: cualquiera puede comprobar qué hace.',
  nodeYou: 'Tu navegador',
  nodeUs: 'Nuestros servidores',
  nodeNot: 'Fuera del camino',
  priceEyebrow: 'Precios',
  priceTitle: 'La app es gratis. A OpenAI le pagas céntimos por hora.',
  priceLead:
    'Usa tu propia clave de OpenAI. Sin suscripción ni comisiones: te cobra tu proveedor, directamente y a su precio.',
  tierLow: 'Low cost',
  tierLowText: 'Frase a frase. Para el día a día.',
  tierMed: 'Medium',
  tierMedText: 'Palabra a palabra, mientras hablan.',
  tierPrem: 'Premium',
  tierPremText: 'La mejor traducción, para lo importante.',
  tierInt: 'Intérprete',
  tierIntText: 'Traducido en voz alta mientras hablan.',
  perHour: '/ hora',
  calcHours: 'Horas de reunión al mes',
  calcPer: 'al mes · sin suscripción',
  priceFine:
    'Estimación por hora de reunión con gente hablando el 65 % del tiempo, a precios estándar de OpenAI. Tu factura de OpenAI o Azure es la referencia.',
  stepsEyebrow: 'Empezar',
  stepsTitle: 'Leyendo en tres pasos',
  step1Title: 'Consigue una clave',
  step1: 'Una clave de la API de OpenAI, o el Azure OpenAI de tu empresa.',
  step2Title: 'Elige',
  step2: 'Tu idioma, y qué escuchar.',
  step3Title: 'Pulsa Empezar',
  step3: 'Y a leer. Ya está.',
  faqTitle: 'Preguntas, respondidas',
  q1: '¿Los demás tienen que instalar algo?',
  a1: 'No. Solo tú abres Neboki Live. Escucha la llamada o la sala, y nadie más tiene que hacer nada.',
  q2: '¿Qué idiomas entiende?',
  a2: 'Detecta solo el idioma hablado, frase a frase, así que se pueden mezclar idiomas. Traduce a más de 20, entre ellos español, inglés, francés, alemán, portugués, italiano, chino, japonés y árabe.',
  q3: '¿Funciona en iPhone y Android?',
  a3: 'Sí, en el navegador. En el móvil escucha por el micrófono; añádela a la pantalla de inicio y se abre a pantalla completa, como una app.',
  q4: '¿Se guarda mi conversación en algún sitio?',
  a4: 'Solo en tu navegador, salvo que entres con tu cuenta y elijas guardarla. El audio va a OpenAI para transcribirlo y traducirlo, con tus propias condiciones de la API.',
  q5: '¿Por qué necesito mi propia clave de OpenAI?',
  a5: 'Es lo que hace que la app sea gratis y privada: pagas al modelo directamente, a precio de coste, y ningún servidor nuestro se mete en tus conversaciones.',
  finalTitle1: 'Lo que dicen,',
  finalTitle2: 'en tu idioma.',
  finalLead: 'Ábrela en el navegador y empieza en menos de un minuto.',
  star: 'Estrella en GitHub',
  license: 'Código abierto con licencia AGPL-3.0',
  appLink: 'App',
  privacy: 'Privacidad',
};

/** What the hero call says, in the speakers' languages; never English or Spanish, so
 *  there is always something to translate into the reader's language */
const DEMO: readonly DemoLine[] = [
  {
    speaker: 0,
    who: 'Jonas',
    lang: 'DE',
    source: 'Ja, ab drei Uhr passt es mir gut.',
    en: 'Yes, from three o’clock works well for me.',
    es: 'Sí, a partir de las tres me viene bien.',
  },
  {
    speaker: 1,
    who: 'Yuki',
    lang: 'JA',
    source: '来週までに見積もりを送ります。',
    en: 'I’ll send the quote by next week.',
    es: 'Os mando el presupuesto antes de la semana que viene.',
  },
  {
    speaker: 2,
    who: 'Camille',
    lang: 'FR',
    source: 'On peut valider le budget aujourd’hui ?',
    en: 'Can we sign off the budget today?',
    es: '¿Podemos aprobar el presupuesto hoy?',
  },
  {
    speaker: 3,
    who: 'Giulia',
    lang: 'IT',
    source: 'Perfetto, preparo io la presentazione.',
    en: 'Great, I’ll prepare the presentation.',
    es: 'Perfecto, yo preparo la presentación.',
  },
];

/** The English text of every element, read once from the page as written */
const english = new Map<Element, string>();
let spanish = prefersSpanish();

// #region Language

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

function money(amount: number): string {
  return new Intl.NumberFormat(spanish ? 'es-ES' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function applyLanguage(): void {
  document.documentElement.lang = spanish ? 'es' : 'en';
  for (const element of document.querySelectorAll('[data-t]')) {
    if (!english.has(element)) english.set(element, element.textContent ?? '');
    const key = element.getAttribute('data-t') ?? '';
    element.textContent = spanish
      ? (ES[key] ?? english.get(element) ?? '')
      : (english.get(element) ?? '');
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-price]')) {
    element.textContent = money(Number(element.dataset.price));
  }
  const toggle = document.querySelector('[data-lang-toggle]');
  if (toggle) {
    toggle.textContent = spanish ? 'EN' : 'ES';
    toggle.setAttribute('aria-label', spanish ? 'English' : 'Español');
  }
  updateTotal();
  showDemoLine(demoIndex, true);
}

// #endregion

// #region Caption demo

const demo = {
  pair: document.querySelector('[data-demo-pair]'),
  prev: document.querySelector('[data-demo-prev]'),
  who: document.querySelector('[data-demo-who]'),
  lang: document.querySelector('[data-demo-lang]'),
  src: document.querySelector('[data-demo-src]'),
  now: document.querySelector('[data-demo-now]'),
  tiles: document.querySelectorAll('[data-speaker]'),
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let demoIndex = 1;
let demoTimer: number | undefined;

function translationOf(line: DemoLine): string {
  return spanish ? line.es : line.en;
}

/** Shows one line of the demo; typed word by word unless `instant` or motion is reduced */
function showDemoLine(index: number, instant = false): void {
  const line = DEMO[index];
  const previous = DEMO[(index + DEMO.length - 1) % DEMO.length];
  if (!line || !previous || !demo.now) return;

  window.clearTimeout(demoTimer);
  if (demo.pair) demo.pair.textContent = `AUTO → ${spanish ? 'ES' : 'EN'}`;
  if (demo.prev) demo.prev.textContent = translationOf(previous);
  if (demo.who) demo.who.textContent = line.who;
  if (demo.lang) demo.lang.textContent = line.lang;
  if (demo.src) demo.src.textContent = line.source;
  demo.tiles.forEach((tile) =>
    tile.classList.toggle(
      'is-speaking',
      tile.getAttribute('data-speaker') === String(line.speaker),
    ),
  );

  const words = translationOf(line).split(' ');
  if (instant || reducedMotion.matches) {
    demo.now.textContent = words.join(' ');
    if (!reducedMotion.matches) demoTimer = window.setTimeout(nextDemoLine, HOLD_MS * 2);
    return;
  }

  let shown = 0;
  const typeNext = (): void => {
    shown += 1;
    if (demo.now) demo.now.textContent = words.slice(0, shown).join(' ');
    demoTimer =
      shown < words.length
        ? window.setTimeout(typeNext, TYPE_MS + Math.random() * TYPE_MS)
        : window.setTimeout(nextDemoLine, HOLD_MS);
  };
  demo.now.textContent = '';
  demoTimer = window.setTimeout(typeNext, 500);
}

function nextDemoLine(): void {
  // Paused while the tab is hidden, so it does not run through the lines unseen
  if (document.hidden) {
    demoTimer = window.setTimeout(nextDemoLine, 1000);
    return;
  }
  demoIndex = (demoIndex + 1) % DEMO.length;
  showDemoLine(demoIndex);
}

// #endregion

// #region Cost calculator

const hoursInput = document.querySelector<HTMLInputElement>('[data-hours]');
const hoursOut = document.querySelector('[data-hours-out]');
const totalOut = document.querySelector('[data-total]');
const tierButtons = document.querySelectorAll<HTMLElement>('[data-tier]');

function selectedRate(): number {
  const checked = document.querySelector<HTMLElement>('[data-tier][aria-checked="true"]');
  const rate = Number(checked?.dataset.tier);
  return Number.isFinite(rate) ? rate : 0;
}

function updateTotal(): void {
  if (!hoursInput || !totalOut) return;
  const hours = Number(hoursInput.value) || 0;
  if (hoursOut) hoursOut.textContent = `${hours} h`;
  totalOut.textContent = money(hours * selectedRate());
}

function selectTier(button: HTMLElement): void {
  tierButtons.forEach((other) => {
    const on = other === button;
    other.setAttribute('aria-checked', String(on));
    other.tabIndex = on ? 0 : -1;
  });
  updateTotal();
}

tierButtons.forEach((button, index) => {
  button.tabIndex = index === 0 ? 0 : -1;
  button.addEventListener('click', () => selectTier(button));
  // Arrow keys move between the options, as in any radio group
  button.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = tierButtons[(index + step + tierButtons.length) % tierButtons.length];
    if (next) {
      selectTier(next);
      next.focus();
    }
  });
});
hoursInput?.addEventListener('input', updateTotal);

// #endregion

// #region Navigation bar

const nav = document.querySelector('[data-nav]');
const markScrolled = (): void => {
  nav?.classList.toggle('is-scrolled', window.scrollY > 8);
};
window.addEventListener('scroll', markScrolled, { passive: true });
markScrolled();

// #endregion

applyLanguage();
document.querySelector('[data-lang-toggle]')?.addEventListener('click', () => {
  spanish = !spanish;
  store(spanish ? 'es' : 'en');
  applyLanguage();
});
