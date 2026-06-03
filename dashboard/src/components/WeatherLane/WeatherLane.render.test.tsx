import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { WeatherLane } from './WeatherLane';

// Real (unmocked) Recharts at a fixed size so jsdom computes real scales. This
// exercises the actual chart integration — useXAxisScale / usePlotArea — which
// the mocked unit tests cannot. It is the regression guard for the Recharts-3
// "<Customized> injects nothing" class of bug.

const catData = [
  { time: '2026-05-20T10:00:00Z', value: 20 },
  { time: '2026-05-20T11:00:00Z', value: 22 },
  { time: '2026-05-20T12:00:00Z', value: 24 },
];
const points = [
  { time: '2026-05-20T10:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
  { time: '2026-05-20T11:00:00Z', value: 22, conditionCode: 1006, condition: 'Cloudy' },
  { time: '2026-05-20T12:00:00Z', value: 24, conditionCode: 1063, condition: 'Rain' },
];

describe('WeatherLane (real Recharts render)', () => {
  it('renders an icon per conditioned bucket on a categorical x-axis, in a band above the plot', () => {
    const { container } = render(
      <ComposedChart width={400} height={200} data={catData} margin={{ top: 26, right: 16, bottom: 0, left: 0 }}>
        <XAxis dataKey="time" />
        <YAxis width={56} />
        <Line dataKey="value" />
        <WeatherLane points={points} iconSize={18} />
      </ComposedChart>,
    );
    const fos = Array.from(container.querySelectorAll('foreignObject'));
    expect(fos.length).toBe(3); // one per conditioned bucket
    fos.forEach((fo) => {
      expect(Number.isFinite(Number(fo.getAttribute('x')))).toBe(true);
      expect(Number(fo.getAttribute('y')) + 18).toBeLessThanOrEqual(26); // band clears the plot top
    });
  });

  it('renders on a numeric time x-axis using the epoch xValue mapper (ChemChart-style)', () => {
    const ep = (t: string) => new Date(t).getTime();
    const numData = catData.map((d) => ({ t: ep(d.time), value: d.value }));
    const { container } = render(
      <ComposedChart width={400} height={200} data={numData} margin={{ top: 22, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" />
        <YAxis width={36} />
        <Line dataKey="value" />
        <WeatherLane points={points} iconSize={16} xValue={ep} />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(3);
  });

  it('collapses a run of identical conditions to one icon when rollupMs is set', () => {
    const sunnyRun = [
      { time: '2026-05-20T10:00:00Z', value: 20 },
      { time: '2026-05-20T10:30:00Z', value: 21 },
      { time: '2026-05-20T11:00:00Z', value: 22 },
    ];
    const sunnyPoints = sunnyRun.map((d) => ({ ...d, conditionCode: 1000, condition: 'Sunny' }));
    const { container } = render(
      <ComposedChart width={400} height={200} data={sunnyRun} margin={{ top: 26, right: 16, bottom: 0, left: 0 }}>
        <XAxis dataKey="time" />
        <YAxis width={56} />
        <Line dataKey="value" />
        <WeatherLane points={sunnyPoints} iconSize={18} rollupMs={2 * 60 * 60 * 1000} />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(1); // one sun for the whole run
  });

  it('renders nothing when no points carry a condition', () => {
    const { container } = render(
      <ComposedChart width={400} height={200} data={catData} margin={{ top: 26, right: 16, bottom: 0, left: 0 }}>
        <XAxis dataKey="time" />
        <YAxis width={56} />
        <Line dataKey="value" />
        <WeatherLane points={catData} iconSize={18} />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
  });
});
