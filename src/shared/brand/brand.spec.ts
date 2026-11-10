import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import {
  BRANDS,
  DEFAULT_BRAND,
  MAX_BRAND_NAME,
  applyBrand,
  brand,
  brandId,
  loadBrand,
  loadBrandCustom,
  logoUrl,
  resetBrandCustom,
  sanitizeCustom,
  setBrand,
  updateBrandCustom,
} from './brand';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('brand', () => {
  afterEach(() => {
    window.localStorage.clear();
    setBrand(DEFAULT_BRAND);
  });

  it('starts as Neboki Live', () => {
    expect(DEFAULT_BRAND).toBe('neboki');
    expect(loadBrand()).toBe('neboki');
  });

  it('ignores an unknown stored brand', () => {
    window.localStorage.setItem('neboki-live:brand', 'acme');
    expect(loadBrand()).toBe('neboki');
  });

  it('stamps the brand and does not store the default', () => {
    setBrand('neboki');
    expect(brandId.value).toBe('neboki');
    expect(window.localStorage.getItem('neboki-live:brand')).toBeNull();
    expect(document.documentElement.dataset.brand).toBe('neboki');
    expect(document.title).toBe('Neboki Live');
  });

  it('puts the name into the messages', () => {
    applyBrand('neboki');
    expect(i18n.global.t('nav.home')).toContain(BRANDS.neboki.name);
  });
});

describe('custom brand', () => {
  afterEach(() => {
    window.localStorage.clear();
    resetBrandCustom();
  });

  it('lays the person’s name, logo and colour over the brand and remembers them', () => {
    updateBrandCustom({ name: '  Ingeteam Live ', logo: PNG, accent: '#0055A4' });
    expect(brand.value.name).toBe('Ingeteam Live');
    expect(logoUrl(brand.value)).toBe(PNG);
    expect(document.title).toBe('Ingeteam Live');
    expect(i18n.global.t('nav.home')).toContain('Ingeteam Live');
    expect(document.documentElement.hasAttribute('data-brand-accent')).toBe(true);
    expect(document.getElementById('lg-brand-accent')?.textContent).toContain('#0055a4');
    expect(loadBrandCustom()).toEqual({ name: 'Ingeteam Live', logo: PNG, accent: '#0055a4' });
  });

  it('puts the brand’s own back field by field, and all at once', () => {
    updateBrandCustom({ name: 'Acme', accent: '#123456' });
    updateBrandCustom({ name: '' });
    expect(brand.value.name).toBe(BRANDS.neboki.name);
    expect(brand.value.accent).toBe('#123456');
    resetBrandCustom();
    expect(brand.value).toEqual(BRANDS.neboki);
    expect(document.documentElement.hasAttribute('data-brand-accent')).toBe(false);
    expect(document.getElementById('lg-brand-accent')).toBeNull();
    expect(window.localStorage.getItem('neboki-live:brand-custom')).toBeNull();
  });

  it('ignores stored values that are not valid', () => {
    window.localStorage.setItem(
      'neboki-live:brand-custom',
      JSON.stringify({ name: 7, logo: 'javascript:alert(1)', accent: 'red' }),
    );
    expect(loadBrandCustom()).toEqual({});
    window.localStorage.setItem('neboki-live:brand-custom', '{not json');
    expect(loadBrandCustom()).toEqual({});
    expect(sanitizeCustom({ name: 'x'.repeat(99) }).name).toHaveLength(MAX_BRAND_NAME);
  });
});
