// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseRange, windowPeriod } from './influx';

describe('parseRange', () => {
  it('handles relative range', () => {
    expect(parseRange('24h')).toBe('start: -24h');
  });

  it('handles relative day range', () => {
    expect(parseRange('3d')).toBe('start: -3d');
  });

  it('handles custom range with inclusive stop date', () => {
    expect(parseRange('custom:2026-04-01:2026-04-04'))
      .toBe('start: 2026-04-01T00:00:00Z, stop: 2026-04-05T00:00:00Z');
  });

  it('handles single-day custom range', () => {
    expect(parseRange('custom:2026-04-04:2026-04-04'))
      .toBe('start: 2026-04-04T00:00:00Z, stop: 2026-04-05T00:00:00Z');
  });

  it('handles month boundary rollover in custom range', () => {
    expect(parseRange('custom:2026-01-30:2026-01-31'))
      .toBe('start: 2026-01-30T00:00:00Z, stop: 2026-02-01T00:00:00Z');
  });

  it('handles year boundary rollover in custom range', () => {
    expect(parseRange('custom:2025-12-30:2025-12-31'))
      .toBe('start: 2025-12-30T00:00:00Z, stop: 2026-01-01T00:00:00Z');
  });
});

describe('windowPeriod', () => {
  it('returns 5m for 6h', () => {
    expect(windowPeriod('6h')).toBe('5m');
  });

  it('returns 5m for 12h', () => {
    expect(windowPeriod('12h')).toBe('5m');
  });

  it('returns 5m for 24h', () => {
    expect(windowPeriod('24h')).toBe('5m');
  });

  it('returns 30m for 3d', () => {
    expect(windowPeriod('3d')).toBe('30m');
  });

  it('returns 1h for 7d', () => {
    expect(windowPeriod('7d')).toBe('1h');
  });

  it('returns 2h for 30d', () => {
    expect(windowPeriod('30d')).toBe('2h');
  });

  it('returns 12h for 60d', () => {
    expect(windowPeriod('60d')).toBe('12h');
  });

  it('returns 5m for unrecognized format', () => {
    expect(windowPeriod('garbage')).toBe('5m');
  });

  it('returns 5m for custom single-day range', () => {
    expect(windowPeriod('custom:2026-04-04:2026-04-04')).toBe('5m');
  });

  it('returns 30m for custom 2-day range', () => {
    expect(windowPeriod('custom:2026-04-03:2026-04-04')).toBe('30m');
  });

  it('returns 30m for custom 3-day range', () => {
    expect(windowPeriod('custom:2026-04-01:2026-04-03')).toBe('30m');
  });

  it('returns 1h for custom 5-day range', () => {
    expect(windowPeriod('custom:2026-04-01:2026-04-05')).toBe('1h');
  });

  it('returns 2h for custom 15-day range', () => {
    expect(windowPeriod('custom:2026-03-20:2026-04-04')).toBe('2h');
  });

  it('returns 6h for custom 60-day range', () => {
    expect(windowPeriod('custom:2026-02-01:2026-04-04')).toBe('6h');
  });
});
