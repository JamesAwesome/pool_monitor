import { describe, it, expect } from 'vitest';
import { selectLaneIcons, consolidateConditions, rollupMsForRange } from './WeatherLane';
import type { WeatherHistoryPoint } from '../../types';

const HOUR_MS = 60 * 60 * 1000;

const pts = [
  { time: '2026-05-20T00:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
  { time: '2026-05-21T00:00:00Z', value: 21, conditionCode: 1006, condition: 'Cloudy' },
  { time: '2026-05-22T00:00:00Z', value: 22 }, // no condition
  { time: '2026-05-23T00:00:00Z', value: 23, conditionCode: 1063, condition: 'Rain' },
];

describe('selectLaneIcons', () => {
  it('keeps only points with a mappable condition', () => {
    const out = selectLaneIcons(pts, 1000); // wide plot, no step-down
    expect(out.map((i) => i.kind)).toEqual(['sun', 'cloud', 'rain']);
  });
  it('steps down to exactly maxIcons and keeps the first of each stride', () => {
    // plotWidth 40px -> maxIcons = floor(40/24) = 1, step = ceil(3/1) = 3 -> index 0 only
    const out = selectLaneIcons(pts, 40);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('sun');
  });
  it('never divides by zero on a plot narrower than one icon gap', () => {
    // plotWidth 1 -> maxIcons = max(1, floor(1/24)) = 1
    const out = selectLaneIcons(pts, 1);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('sun');
  });
  it('keeps every mappable icon when the plot is wide enough', () => {
    expect(selectLaneIcons(pts, 1000).length).toBe(3);
  });
  it('pins the stride on a dense set (10 icons, narrow plot)', () => {
    const many: WeatherHistoryPoint[] = Array.from({ length: 10 }, (_, i) => ({
      time: `2026-05-${10 + i}T00:00:00Z`, value: 20, conditionCode: 1000, condition: 'Sunny',
    }));
    // plotWidth 60 -> maxIcons = floor(60/24) = 2, step = ceil(10/2) = 5 -> indices 0,5
    const out = selectLaneIcons(many, 60);
    expect(out.length).toBe(2);
  });
  it('returns [] when no points carry a condition', () => {
    expect(selectLaneIcons([{ time: 't', value: 1 }], 1000)).toEqual([]);
  });
});

// The render path (useXAxisScale / usePlotArea, positioning, off-domain skip) is
// covered against REAL Recharts in WeatherLane.render.test.tsx — that is the only
// place that meaningfully exercises the chart integration.

describe('consolidateConditions', () => {
  it('collapses consecutive identical conditions into one icon at each run start', () => {
    const pts: WeatherHistoryPoint[] = [
      { time: '2026-05-20T10:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T10:30:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T11:00:00Z', value: 21, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T12:00:00Z', value: 22, conditionCode: 1006, condition: 'Cloudy' },
      { time: '2026-05-20T13:00:00Z', value: 22, conditionCode: 1006, condition: 'Cloudy' },
    ];
    const out = consolidateConditions(pts, HOUR_MS);
    expect(out.map((p) => p.conditionCode)).toEqual([1000, 1006]);
    expect(out[0].time).toBe('2026-05-20T10:00:00Z'); // start of the sunny run
    expect(out[1].time).toBe('2026-05-20T12:00:00Z'); // start of the cloudy run
    expect(out[0].condition).toBe('Sunny');
  });

  it('suppresses a brief flicker: dominant condition per rollup window wins', () => {
    const pts: WeatherHistoryPoint[] = [
      { time: '2026-05-20T10:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T10:15:00Z', value: 20, conditionCode: 1006, condition: 'Cloudy' }, // blip
      { time: '2026-05-20T10:30:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T10:45:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
    ];
    expect(consolidateConditions(pts, HOUR_MS).map((p) => p.conditionCode)).toEqual([1000]);
  });

  it('re-emits a condition that returns after a change (distinct runs)', () => {
    const pts: WeatherHistoryPoint[] = [
      { time: '2026-05-20T10:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
      { time: '2026-05-20T11:00:00Z', value: 20, conditionCode: 1006, condition: 'Cloudy' },
      { time: '2026-05-20T12:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
    ];
    expect(consolidateConditions(pts, HOUR_MS).map((p) => p.conditionCode)).toEqual([1000, 1006, 1000]);
  });

  it('ignores points without a condition', () => {
    const pts: WeatherHistoryPoint[] = [
      { time: '2026-05-20T10:00:00Z', value: 20 },
      { time: '2026-05-20T11:00:00Z', value: 21, conditionCode: 1000, condition: 'Sunny' },
    ];
    expect(consolidateConditions(pts, HOUR_MS).map((p) => p.conditionCode)).toEqual([1000]);
  });

  it('returns input unchanged when rollupMs <= 0', () => {
    const pts: WeatherHistoryPoint[] = [{ time: 't', value: 1, conditionCode: 1000, condition: 'Sunny' }];
    expect(consolidateConditions(pts, 0)).toBe(pts);
  });
});

describe('rollupMsForRange', () => {
  it('maps quick ranges to the lane rollup floor', () => {
    expect(rollupMsForRange('6h')).toBe(30 * 60 * 1000);
    expect(rollupMsForRange('12h')).toBe(HOUR_MS);
    expect(rollupMsForRange('24h')).toBe(HOUR_MS);
    expect(rollupMsForRange('3d')).toBe(3 * HOUR_MS);
    expect(rollupMsForRange('7d')).toBe(6 * HOUR_MS);
    expect(rollupMsForRange('30d')).toBe(24 * HOUR_MS);
  });
  it('scales custom ranges by span', () => {
    expect(rollupMsForRange('custom:2026-05-01:2026-05-01')).toBe(HOUR_MS);       // 1 day span
    expect(rollupMsForRange('custom:2026-05-01:2026-05-10')).toBe(24 * HOUR_MS);  // ~10 days
  });
});
