import { describe, expect, it } from 'vitest';
import { fakeOpenAiKey } from '@/shared/testing/keys.fakes';
import { isLikelyAzureKey, isLikelyOpenAiKey, normalizeApiKey } from './apiKey';

describe('isLikelyOpenAiKey', () => {
  it.each([
    fakeOpenAiKey('proj-FAKEx0123456789_xyz-FAKEx0123456789'),
    fakeOpenAiKey(),
    `  ${fakeOpenAiKey()}  `,
  ])('accepts %s', (key) => {
    expect(isLikelyOpenAiKey(key)).toBe(true);
  });

  it.each([
    '',
    fakeOpenAiKey(''),
    fakeOpenAiKey('short'),
    'pk-FAKExFAKExFAKExFAKExFAKEx',
    fakeOpenAiKey('FAKExFAKEx FAKExFAKEx FAKE'),
  ])('rejects %s', (key) => {
    expect(isLikelyOpenAiKey(key)).toBe(false);
  });
});

describe('normalizeApiKey', () => {
  const KEY = fakeOpenAiKey('proj-FAKEx0123456789_xyz-FAKEx0123456789');

  it.each([
    [`${KEY.slice(0, 24)}\n${KEY.slice(24)}`],
    [`"${KEY}"`],
    [`Bearer ${KEY}`],
    [`\u200B${KEY}\uFEFF`],
    [`  ${KEY}\r\n`],
  ])('cleans %j into a valid key', (pasted) => {
    expect(normalizeApiKey(pasted)).toBe(KEY);
    expect(isLikelyOpenAiKey(normalizeApiKey(pasted))).toBe(true);
  });

  it('leaves a clean key untouched', () => {
    expect(normalizeApiKey(KEY)).toBe(KEY);
  });
});

describe('isLikelyAzureKey', () => {
  it.each(['0123456789abcdef0123456789abcdef', 'A1'.repeat(42)])('accepts %s', (key) => {
    expect(isLikelyAzureKey(key)).toBe(true);
  });

  it.each(['', 'short', fakeOpenAiKey()])('rejects %j', (key) => {
    expect(isLikelyAzureKey(key)).toBe(false);
  });
});
