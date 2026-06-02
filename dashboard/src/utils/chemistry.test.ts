import { describe, it, expect } from 'vitest';
import { latestReading, computeDelta, computeStats, formatChemValue } from './chemistry';
import type { ChemistryReading } from '../types';

const READINGS: ChemistryReading[] = [
  { id: '2026-05-10T16:00:00Z', date: '2026-05-10', time: '12:00', ph: 7.4, fc: 2.0 },
  { id: '2026-05-20T16:00:00Z', date: '2026-05-20', time: '12:00', ph: 7.5, fc: 3.0 },
  { id: '2026-05-29T16:00:00Z', date: '2026-05-29', time: '12:00', ph: 7.7, fc: 4.0 }, // newest last
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
      { id: '2026-05-20T16:00:00Z', date: '2026-05-20', time: '12:00', ta: 88 },
      { id: '2026-05-29T16:00:00Z', date: '2026-05-29', time: '12:00', ta: 88 },
    ];
    expect(computeDelta(flat, 'ta', 0)).toEqual({ dir: 'flat', magnitude: 0 });
  });
  it('returns null with fewer than two readings for the key', () => {
    expect(computeDelta([{ id: 'x', date: 'x', time: '12:00', ph: 7 }], 'ph', 1)).toBeNull();
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

import { testsOnDay, sortedDesc, fmtTime12, fmtDateWeekday } from './chemistry';

const rs = [
  { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6 },
  { id: '2026-05-20T20:30:00Z', date: '2026-05-20', time: '16:30', fc: 6.8 },
  { id: '2026-05-24T12:35:00Z', date: '2026-05-24', time: '08:35', fc: 2.9 },
];

describe('testsOnDay', () => {
  it('counts tests on a given date', () => {
    expect(testsOnDay(rs, '2026-05-20')).toBe(2);
    expect(testsOnDay(rs, '2026-05-24')).toBe(1);
    expect(testsOnDay(rs, '2026-05-25')).toBe(0);
  });
});
describe('sortedDesc', () => {
  it('orders newest id first', () => {
    expect(sortedDesc(rs).map(r => r.id)).toEqual([
      '2026-05-24T12:35:00Z', '2026-05-20T20:30:00Z', '2026-05-20T11:50:00Z',
    ]);
  });
});
describe('fmtTime12', () => {
  it('formats 24h to 12h', () => {
    expect(fmtTime12('07:50')).toBe('7:50 AM');
    expect(fmtTime12('16:30')).toBe('4:30 PM');
    expect(fmtTime12('00:05')).toBe('12:05 AM');
    expect(fmtTime12('12:00')).toBe('12:00 PM');
  });
});
describe('fmtDateWeekday', () => {
  it('formats YYYY-MM-DD to weekday short', () => {
    // 2026-05-29 is a Friday
    expect(fmtDateWeekday('2026-05-29')).toMatch(/^Fri, May 29$/);
  });
});
