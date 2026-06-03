import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { selectLaneIcons, LaneLayer, type CustomizedProps } from './WeatherLane';
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

describe('LaneLayer (Customized render path)', () => {
  const offset = { top: 26, left: 56, width: 300, height: 150 };
  const lanePts: WeatherHistoryPoint[] = [
    { time: '2026-05-20T10:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
    { time: '2026-05-20T11:00:00Z', value: 21, conditionCode: 1006, condition: 'Cloudy' },
  ];

  function renderLane(props: CustomizedProps & { points: WeatherHistoryPoint[]; iconSize?: number; xValue?: (t: string) => string | number }) {
    return render(<svg>{LaneLayer(props)}</svg>);
  }

  it('positions each icon centered on its scaled x, in a band fully above the plot', () => {
    const scale = vi.fn((v: string | number) => (v === '2026-05-20T10:00:00Z' ? 100 : 200));
    const { container } = renderLane({
      xAxisMap: { '0': { scale, x: 56, width: 300 } }, offset, points: lanePts, iconSize: 18,
    });
    const fos = Array.from(container.querySelectorAll('foreignObject'));
    expect(fos.length).toBe(2);
    // x = scaled center - iconSize/2
    expect(fos[0].getAttribute('x')).toBe(String(100 - 9));
    expect(fos[1].getAttribute('x')).toBe(String(200 - 9));
    // y = top band, and the icon must sit ABOVE the plot (no overlap into data)
    const y = Number(fos[0].getAttribute('y'));
    expect(y).toBe(Math.max(0, offset.top - 18 - 2)); // 6
    expect(y + 18).toBeLessThanOrEqual(offset.top); // 24 <= 26 — clears the plot
  });

  it('uses identity scale input by default (categorical string axis)', () => {
    const scale = vi.fn(() => 100);
    renderLane({ xAxisMap: { '0': { scale, x: 56, width: 300 } }, offset, points: [lanePts[0]] });
    expect(scale).toHaveBeenCalledWith('2026-05-20T10:00:00Z');
  });

  it('maps to epoch ms when xValue is provided (numeric time axis)', () => {
    const scale = vi.fn(() => 100);
    renderLane({
      xAxisMap: { '0': { scale, x: 56, width: 300 } }, offset, points: [lanePts[0]],
      xValue: (t) => new Date(t).getTime(),
    });
    expect(scale).toHaveBeenCalledWith(new Date('2026-05-20T10:00:00Z').getTime());
  });

  it('skips icons whose scaled x is non-finite (off-domain, fail-silent)', () => {
    const scale = vi.fn((v: string | number) => (v === '2026-05-20T10:00:00Z' ? NaN : 200));
    const { container } = renderLane({
      xAxisMap: { '0': { scale, x: 56, width: 300 } }, offset, points: lanePts,
    });
    expect(container.querySelectorAll('foreignObject').length).toBe(1);
  });

  it('renders nothing when the chart offset/axis map is absent', () => {
    const { container } = renderLane({ points: lanePts });
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
  });
});
