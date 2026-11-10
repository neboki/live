// Turns one colour picked by a person into the accent tokens of global.scss, for the
// light and the dark theme. Text and filled controls are pushed darker (light theme) or
// lighter (dark theme) until they pass WCAG AA, so any colour stays readable.

type Rgb = readonly [number, number, number];

/** A colour picked in an <input type="color">: #rrggbb */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** The surfaces the accent sits on, from global.scss */
const LIGHT_BG: Rgb = [243, 244, 246];
const DARK_BG: Rgb = [24, 24, 24];
const GLASS_BG: Rgb = [20, 20, 22];
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const AA = 4.5;
/** How far the warm end of the brand gradient turns from the accent */
const WARM_HUE_SHIFT = 25;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const at = (x: number, y: number): number => x + (y - x) * amount;
  return [at(a[0], b[0]), at(a[1], b[1]), at(a[2], b[2])];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(c: Rgb): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a));
  const lb = luminance(parseHex(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Moves `c` towards `towards` in small steps until it reaches `ratio` against `bg` */
function pushUntil(c: Rgb, towards: Rgb, bg: Rgb, ratio: number): Rgb {
  const bgHex = toHex(bg);
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(c, towards, step / 20);
    if (contrast(toHex(candidate), bgHex) >= ratio) return candidate;
  }
  return towards;
}

function shiftHue(c: Rgb, degrees: number): Rgb {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return c;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + degrees) % 360) + 360) % 360;
  const chroma = s * (1 - Math.abs(2 * l - 1));
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const sector = Math.floor(h / 60);
  const sectors: readonly Rgb[] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const [r1, g1, b1] = sectors[sector] ?? [0, 0, 0];
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function alpha(c: Rgb, percent: number): string {
  return `rgb(${c.map(Math.round).join(' ')} / ${percent}%)`;
}

export type AccentTokens = Readonly<Record<string, string>>;

/** The accent tokens of the light theme, from one colour */
export function lightAccentTokens(hex: string): AccentTokens {
  const c = parseHex(hex);
  const text = toHex(pushUntil(c, BLACK, LIGHT_BG, AA));
  return {
    '--accent': hex,
    '--accent-strong': toHex(mix(c, BLACK, 0.12)),
    '--accent-text': text,
    // White text sits on it, and white is lighter than the light background
    '--accent-fill': text,
    '--accent-soft': alpha(c, 10),
    '--accent-selected': alpha(c, 18),
    '--accent-glow': alpha(c, 12),
    '--accent-glow-strong': alpha(c, 30),
    '--accent-warm': toHex(shiftHue(c, WARM_HUE_SHIFT)),
    '--glass-accent': toHex(pushUntil(c, WHITE, GLASS_BG, AA)),
  };
}

/** The accent tokens of the dark theme: lifted until they read on dark surfaces */
export function darkAccentTokens(hex: string): AccentTokens {
  const c = pushUntil(parseHex(hex), WHITE, DARK_BG, AA);
  return {
    '--accent': toHex(c),
    '--accent-strong': toHex(mix(c, BLACK, 0.1)),
    '--accent-text': toHex(c),
    '--accent-soft': alpha(c, 15),
    '--accent-selected': alpha(c, 26),
    '--accent-glow': alpha(c, 22),
    '--accent-glow-strong': alpha(c, 45),
  };
}

function block(selector: string, tokens: AccentTokens): string {
  const body = Object.entries(tokens)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  return `${selector}{${body}}`;
}

/**
 * A stylesheet that lays the colour over the default accent. `html:root[attr]` outranks
 * the plain `:root` and `:root[data-theme]` blocks of global.scss whatever the order.
 */
export function accentStylesheet(hex: string, attr: string): string {
  const root = `html:root[${attr}]`;
  const dark = darkAccentTokens(hex);
  return [
    block(root, lightAccentTokens(hex)),
    `@media (prefers-color-scheme: dark){${block(`${root}:not([data-theme='light'])`, dark)}}`,
    block(`${root}[data-theme='dark']`, dark),
  ].join('\n');
}
