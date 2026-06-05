import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { SwimLane } from './SwimLane';
import type { SwimSession } from '../../types';

// Real (unmocked) Recharts at a fixed size so jsdom computes real scales. This
// exercises the actual chart integration — useXAxisScale / useYAxisScale /
// usePlotArea — and locks down the off-domain skip (markers outside the series
// time domain must render nothing). Mirrors WeatherLane.render.test.tsx.

const ep = (t: string) => new Date(t).getTime();

// A three-point series spanning 10:00 → 12:00 on a numeric (epoch) x-axis.
const numData = [
  { time: '2026-05-20T10:00:00Z', value: 20 },
  { time: '2026-05-20T11:00:00Z', value: 22 },
  { time: '2026-05-20T12:00:00Z', value: 24 },
];
const numChartData = numData.map((d) => ({ t: ep(d.time), value: d.value }));
const series = numChartData.map((d) => ({ t: d.t, value: d.value as number | undefined }));

function swim(id: string, people: string[]): SwimSession {
  const d = new Date(id);
  return {
    id,
    date: id.slice(0, 10),
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    people,
  };
}

// A swim well inside the 10:00–12:00 domain.
const inDomain = swim('2026-05-20T11:00:00Z', ['🦦']);
// A swim AFTER the domain end — must be skipped (off-domain).
const afterDomain = swim('2026-05-20T18:00:00Z', ['🐢']);
// A swim BEFORE the domain start — must be skipped (off-domain).
const beforeDomain = swim('2026-05-20T06:00:00Z', ['🐬']);

function renderInChart(node: React.ReactNode, data = numChartData) {
  return render(
    <ComposedChart width={400} height={200} data={data} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" />
      <YAxis width={36} />
      <Line dataKey="value" />
      {node}
    </ComposedChart>,
  );
}

describe('SwimLane (real Recharts render)', () => {
  it('renders a marker (with the swimmer emoji) for an in-domain swim', () => {
    const { container } = renderInChart(
      <SwimLane swims={[inDomain]} series={series} xMode="scale" color="#38bdf8" />,
    );
    const fos = Array.from(container.querySelectorAll('foreignObject'));
    expect(fos.length).toBe(1);
    expect(container.textContent).toContain('🦦');
  });

  it('renders NOTHING for a swim whose epoch is after the series time domain', () => {
    const { container } = renderInChart(
      <SwimLane swims={[afterDomain]} series={series} xMode="scale" color="#38bdf8" />,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
    expect(container.textContent).not.toContain('🐢');
  });

  it('renders NOTHING for a swim whose epoch is before the series time domain', () => {
    const { container } = renderInChart(
      <SwimLane swims={[beforeDomain]} series={series} xMode="scale" color="#38bdf8" />,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
    expect(container.textContent).not.toContain('🐬');
  });

  it('renders only the in-domain swims when mixed with off-domain ones', () => {
    const { container } = renderInChart(
      <SwimLane
        swims={[beforeDomain, inDomain, afterDomain]}
        series={series}
        xMode="scale"
        color="#38bdf8"
      />,
    );
    // Only the single in-domain swim survives the tMin..tMax filter.
    expect(container.querySelectorAll('foreignObject').length).toBe(1);
    expect(container.textContent).toContain('🦦');
    expect(container.textContent).not.toContain('🐢');
    expect(container.textContent).not.toContain('🐬');
  });

  it('renders nothing when the series is empty', () => {
    const { container } = renderInChart(
      <SwimLane swims={[inDomain]} series={[]} xMode="scale" color="#38bdf8" />,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
  });

  it('renders on a categorical (index) x-axis host (TempChart-style)', () => {
    const catData = numData.map((d) => ({ time: d.time, value: d.value }));
    const { container } = render(
      <ComposedChart width={400} height={200} data={catData} margin={{ top: 20, right: 8, bottom: 4, left: 0 }}>
        <XAxis dataKey="time" />
        <YAxis width={36} />
        <Line dataKey="value" />
        <SwimLane swims={[inDomain]} series={series} xMode="index" color="#38bdf8" />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(1);
    expect(container.textContent).toContain('🦦');
  });

  it('compact mode and full mode both render the emoji but differ structurally (no stem/foot in compact)', () => {
    const full = renderInChart(
      <SwimLane swims={[inDomain]} series={series} xMode="scale" color="#38bdf8" />,
    );
    const compact = renderInChart(
      <SwimLane swims={[inDomain]} series={series} xMode="scale" color="#38bdf8" compact />,
    );

    // Both render exactly one marker carrying the emoji.
    expect(full.container.querySelectorAll('foreignObject').length).toBe(1);
    expect(compact.container.querySelectorAll('foreignObject').length).toBe(1);
    expect(full.container.textContent).toContain('🦦');
    expect(compact.container.textContent).toContain('🦦');

    // Full mode adds a stem + foot (two aria-hidden spans) inside the marker;
    // compact mode adds none. Count the aria-hidden spans as the structural diff.
    const ariaHidden = (c: HTMLElement) =>
      c.querySelectorAll('span[aria-hidden="true"]').length;
    expect(ariaHidden(full.container)).toBe(2); // stem + foot
    expect(ariaHidden(compact.container)).toBe(0); // none
  });
});
