import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { BRANDS, DEFAULT_BRAND, applyBrand, brandId, loadBrand, setBrand } from './brand';

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
