// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { bucketConditions } from './weatherBuckets';

// windowPeriod('24h') === '5m'; windowPeriod('7d') === '1h'; windowPeriod('30d') === '2h'.
// bucketConditions buckets samples into floor(time / windowMs) and returns one
// point per bucket at the bucket-START time, with the MODE code (ties -> earliest-seen).

describe('bucketConditions', () => {
  it('returns the mode code per bucket with its label, keyed at bucket start', () => {
    // 7d -> 1h windows. Two samples in the 10:00 hour: sunny x2 vs cloud x1 -> sunny.
    const samples = [
      { time: '2026-05-20T10:05:00Z', code: 1000, label: 'Sunny' },
      { time: '2026-05-20T10:25:00Z', code: 1000, label: 'Sunny' },
      { time: '2026-05-20T10:45:00Z', code: 1006, label: 'Cloudy' },
      { time: '2026-05-20T11:30:00Z', code: 1006, label: 'Cloudy' },
    ];
    const out = bucketConditions(samples, '7d');
    expect(out).toEqual([
      { time: '2026-05-20T10:00:00.000Z', conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T11:00:00.000Z', conditionCode: 1006, condition: 'Cloudy' },
    ]);
  });

  it('breaks ties by earliest-seen code (deterministic)', () => {
    const samples = [
      { time: '2026-05-20T10:10:00Z', code: 1006, label: 'Cloudy' },
      { time: '2026-05-20T10:40:00Z', code: 1000, label: 'Sunny' },
    ];
    // 1h window, one each -> tie -> earliest-seen (1006 Cloudy)
    expect(bucketConditions(samples, '7d')).toEqual([
      { time: '2026-05-20T10:00:00.000Z', conditionCode: 1006, condition: 'Cloudy' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(bucketConditions([], '7d')).toEqual([]);
  });

  it('sorts buckets ascending by time', () => {
    const samples = [
      { time: '2026-05-21T00:00:00Z', code: 1000, label: 'Sunny' },
      { time: '2026-05-20T00:00:00Z', code: 1006, label: 'Cloudy' },
    ];
    const out = bucketConditions(samples, '30d'); // 2h windows
    expect(out.map((p) => p.time)).toEqual([
      '2026-05-20T00:00:00.000Z', '2026-05-21T00:00:00.000Z',
    ]);
  });
});
