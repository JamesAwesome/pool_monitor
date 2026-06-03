import { describe, it, expect } from 'vitest';
import { readingLanePoints } from './readingLanePoints';

const reading = (id: string, fc: number) => ({ id, date: id.slice(0, 10), time: '12:00', fc });

describe('readingLanePoints', () => {
  it('attaches each reading-day dominant condition from airHistory', () => {
    const readings = [reading('2026-05-20T16:00:00Z', 3), reading('2026-05-22T16:00:00Z', 4)];
    const air = [
      { time: '2026-05-20T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-22T12:00:00Z', value: 24, conditionCode: 1063, condition: 'Rain' },
    ];
    expect(readingLanePoints(readings, air)).toEqual([
      { time: '2026-05-20T16:00:00Z', value: 0, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-22T16:00:00Z', value: 0, conditionCode: 1063, condition: 'Rain' },
    ]);
  });
  it('omits readings whose day has no weather condition', () => {
    const readings = [reading('2026-05-21T16:00:00Z', 3)];
    const air = [{ time: '2026-05-20T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' }];
    expect(readingLanePoints(readings, air)).toEqual([]);
  });
  it('uses the first bucket carrying a condition for a day', () => {
    const readings = [reading('2026-05-20T16:00:00Z', 3)];
    const air = [
      { time: '2026-05-20T06:00:00Z', value: 20 },
      { time: '2026-05-20T12:00:00Z', value: 28, conditionCode: 1006, condition: 'Cloudy' },
      { time: '2026-05-20T18:00:00Z', value: 26, conditionCode: 1000, condition: 'Sunny' },
    ];
    expect(readingLanePoints(readings, air)[0].conditionCode).toBe(1006);
  });
  it('returns [] when there are no readings', () => {
    expect(readingLanePoints([], [])).toEqual([]);
  });
});
