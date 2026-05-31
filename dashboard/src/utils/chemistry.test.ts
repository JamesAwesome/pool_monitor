import { describe, it, expect } from 'vitest';
import { latestReading, computeDelta, computeStats, formatChemValue } from './chemistry';
import type { ChemistryReading } from '../types';

const READINGS: ChemistryReading[] = [
  { date: '2026-05-10T16:00:00Z', ph: 7.4, fc: 2.0 },
  { date: '2026-05-20T16:00:00Z', ph: 7.5, fc: 3.0 },
  { date: '2026-05-29T16:00:00Z', ph: 7.7, fc: 4.0 }, // newest last
];

describe('latestReading', () => {
  it('returns the newest reading value for a key', () => {
    expect(latestReading(READINGS, 'ph')).toBe(7.7);
  });
  it('returns null when no reading has the key', () => {
    expect(latestReading(READINGS, 'ta')).toBeNull();
  });
});

describe('computeDelta', () => {
  it('reports an upward change vs the previous reading', () => {
    expect(computeDelta(READINGS, 'ph', 1)).toEqual({ dir: 'up', magnitude: 0.2 });
  });
  it('reports flat when the change is below half a display unit', () => {
    const flat: ChemistryReading[] = [
      { date: '2026-05-20T16:00:00Z', ta: 88 },
      { date: '2026-05-29T16:00:00Z', ta: 88 },
    ];
    expect(computeDelta(flat, 'ta', 0)).toEqual({ dir: 'flat', magnitude: 0 });
  });
  it('returns null with fewer than two readings for the key', () => {
    expect(computeDelta([{ date: 'x', ph: 7 }], 'ph', 1)).toBeNull();
  });
});

describe('computeStats', () => {
  it('computes low/avg/high over readings that have the key', () => {
    expect(computeStats(READINGS, 'fc')).toEqual({ low: 2.0, avg: 3.0, high: 4.0, count: 3 });
  });
  it('returns null when no readings have the key', () => {
    expect(computeStats(READINGS, 'ch')).toBeNull();
  });
});

describe('formatChemValue', () => {
  it('formats to the chemical decimals', () => {
    expect(formatChemValue(7.66, 1)).toBe('7.7');
    expect(formatChemValue(88.2, 0)).toBe('88');
  });
});
