import { describe, it, expect } from 'vitest';
import { conditionToIcon } from './conditionIcon';

describe('conditionToIcon', () => {
  it('maps clear/sunny (1000) to sun + warning color', () => {
    const r = conditionToIcon(1000, true);
    expect(r?.kind).toBe('sun');
    expect(r?.colorVar).toBe('var(--color-warning)');
  });
  it('maps partly cloudy (1003) to partly', () => {
    expect(conditionToIcon(1003, true)?.kind).toBe('partly');
  });
  it('maps cloud/overcast/fog (1006,1009,1135,1147) to cloud + secondary', () => {
    for (const c of [1006, 1009, 1135, 1147]) {
      const r = conditionToIcon(c, true);
      expect(r?.kind).toBe('cloud');
      expect(r?.colorVar).toBe('var(--color-text-secondary)');
    }
  });
  it('maps rain/snow/storm ranges to rain + primary', () => {
    for (const c of [1063, 1180, 1201, 1240, 1282]) {
      const r = conditionToIcon(c, true);
      expect(r?.kind).toBe('rain');
      expect(r?.colorVar).toBe('var(--color-primary)');
    }
  });
  it('returns null for an unknown code', () => {
    expect(conditionToIcon(9999, true)).toBeNull();
  });
});
