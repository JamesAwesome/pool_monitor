import { describe, it, expect } from 'vitest';
import { formatChemTooltipItem, formatChemTooltipLabel } from './chemTooltip';

describe('formatChemTooltipItem', () => {
  const base = { name: 'pH', decimals: 1, unit: '', tempUnit: '°F' };
  it('formats the chem value with decimals + chemical name, no unit for pH', () => {
    expect(formatChemTooltipItem('chem', 7.6, base)).toEqual(['7.6', 'pH']);
  });
  it('appends the unit when present', () => {
    expect(formatChemTooltipItem('chem', 3.56, { name: 'Free Chlorine', decimals: 1, unit: 'ppm', tempUnit: '°F' }))
      .toEqual(['3.6 ppm', 'Free Chlorine']);
  });
  it('respects 0 decimals', () => {
    expect(formatChemTooltipItem('chem', 90.4, { name: 'Total Alkalinity', decimals: 0, unit: 'ppm', tempUnit: '°F' }))
      .toEqual(['90 ppm', 'Total Alkalinity']);
  });
  it('formats pool/air temps to one decimal with the unit', () => {
    expect(formatChemTooltipItem('pool', 77.43, base)).toEqual(['77.4°F', 'Pool temp']);
    expect(formatChemTooltipItem('air', 88, { ...base, tempUnit: '°C' })).toEqual(['88.0°C', 'Air temp']);
  });
  it('returns null for an unknown series key', () => {
    expect(formatChemTooltipItem('whatever', 1, base)).toBeNull();
  });
});

describe('formatChemTooltipLabel', () => {
  it('returns a non-empty date + time label with a separator', () => {
    const label = formatChemTooltipLabel(new Date('2026-06-05T18:00:00Z').getTime());
    expect(label).toContain('·');
    expect(label.length).toBeGreaterThan(0);
  });
});
