// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseRange, windowPeriod, computePeriods } from './influx';

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

describe('computePeriods', () => {
  it('returns 3 periods for a relative range', () => {
    const periods = computePeriods('3d')
    expect(periods).toHaveLength(3)
    // Each period should have start and stop as ISO strings
    for (const p of periods) {
      expect(p.start).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(p.stop).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('periods do not overlap', () => {
    const periods = computePeriods('24h')
    expect(periods).toHaveLength(3)
    // Period 0 is most recent, period 2 is oldest
    for (let i = 0; i < periods.length - 1; i++) {
      const currentStart = new Date(periods[i].start).getTime()
      const nextStop = new Date(periods[i + 1].stop).getTime()
      expect(currentStart).toBe(nextStop)
    }
  })

  it('each period has equal duration', () => {
    const periods = computePeriods('7d')
    const durations = periods.map(p =>
      new Date(p.stop).getTime() - new Date(p.start).getTime()
    )
    expect(durations[0]).toBe(durations[1])
    expect(durations[1]).toBe(durations[2])
  })

  it('handles custom range', () => {
    const periods = computePeriods('custom:2026-04-01:2026-04-03')
    expect(periods).toHaveLength(3)
    expect(periods[0].start).toBe('2026-04-01T00:00:00Z')
    expect(periods[0].stop).toBe('2026-04-04T00:00:00Z')
  })

  it('falls back to 24h for unrecognized range', () => {
    const periods = computePeriods('garbage')
    expect(periods).toHaveLength(3)
    const duration = new Date(periods[0].stop).getTime() - new Date(periods[0].start).getTime()
    expect(duration).toBe(24 * 3600 * 1000)
  })
});
