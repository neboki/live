import { describe, expect, it } from 'vitest';
import {
  accentStylesheet,
  contrast,
  darkAccentTokens,
  isHexColor,
  lightAccentTokens,
} from './brandColors';

const SAMPLES = ['#ff5a5f', '#ffee00', '#00a3e0', '#0055a4', '#111111', '#ffffff', '#7fff00'];

describe('brandColors', () => {
  it('accepts only #rrggbb', () => {
    expect(isHexColor('#0055A4')).toBe(true);
    expect(isHexColor('#05a')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });

  it.each(SAMPLES)('keeps text and filled controls readable for %s', (hex) => {
    const light = lightAccentTokens(hex);
    expect(contrast(light['--accent-text'] ?? '', '#f3f4f6')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--accent-fill'] ?? '', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--glass-accent'] ?? '', '#141416')).toBeGreaterThanOrEqual(4.5);
    const dark = darkAccentTokens(hex);
    expect(contrast(dark['--accent-text'] ?? '', '#181818')).toBeGreaterThanOrEqual(4.5);
  });

  it('writes a light block and two dark ones', () => {
    const css = accentStylesheet('#0055a4', 'data-x');
    expect(css).toContain('html:root[data-x]{--accent:#0055a4;');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain("html:root[data-x][data-theme='dark']{");
  });
});
