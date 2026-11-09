import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { PRICES } from '../pricing';
import { useSessionRecord } from '../store/useSessionRecord';
import { useSessionCost } from './useSessionCost';

describe('useSessionCost', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('follows the usage of the current session', () => {
    const record = useSessionRecord();
    const cost = useSessionCost();
    expect(cost.value).toBe(0);

    record.addUsage({
      model: 'gpt-6-luna',
      inputTokens: 1e6,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(cost.value).toBeCloseTo(PRICES['gpt-6-luna']?.input ?? Number.NaN, 10);

    record.begin({ pair: { from: '', to: 'ES' }, startedAt: 0 });
    expect(cost.value).toBe(0);
  });
});
