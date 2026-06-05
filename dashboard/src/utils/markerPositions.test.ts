import { describe, it, expect } from 'vitest';
import { interpolateValueAt, indexFractionAt } from './markerPositions';

const pts = [
  { t: 0, value: 10 },
  { t: 100, value: 20 },
  { t: 200, value: 10 },
];

describe('interpolateValueAt', () => {
  it('returns the endpoint value at or before the first point', () => {
    expect(interpolateValueAt(pts, -5)).toBe(10);
  });
  it('returns the endpoint value at or after the last point', () => {
    expect(interpolateValueAt(pts, 999)).toBe(10);
  });
  it('linearly interpolates between two points', () => {
    expect(interpolateValueAt(pts, 50)).toBe(15);
    expect(interpolateValueAt(pts, 150)).toBe(15);
  });
  it('returns null when there are no points', () => {
    expect(interpolateValueAt([], 50)).toBeNull();
  });
  it('skips undefined-valued gap points when bracketing', () => {
    const gappy = [{ t: 0, value: 10 }, { t: 100, value: undefined }, { t: 200, value: 30 }];
    // nearest defined points are t=0 (10) and t=200 (30); at t=100 → 20
    expect(interpolateValueAt(gappy, 100)).toBe(20);
  });
});

describe('indexFractionAt', () => {
  it('maps a time to its fractional index 0..(n-1)', () => {
    expect(indexFractionAt(pts, 0)).toBe(0);
    expect(indexFractionAt(pts, 100)).toBe(1);
    expect(indexFractionAt(pts, 50)).toBe(0.5);
    expect(indexFractionAt(pts, 150)).toBe(1.5);
  });
  it('clamps before the first / after the last', () => {
    expect(indexFractionAt(pts, -10)).toBe(0);
    expect(indexFractionAt(pts, 500)).toBe(2);
  });
  it('returns null for fewer than 2 points', () => {
    expect(indexFractionAt([{ t: 0, value: 1 }], 0)).toBeNull();
  });
});
