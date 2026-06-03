import { describe, it, expect } from 'vitest';
import { selectLaneIcons } from './WeatherLane';
import type { WeatherHistoryPoint } from '../../types';

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
