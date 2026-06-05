import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { EventLane } from './EventLane';
import type { PoolEvent } from '../../types';

// Real (unmocked) Recharts at a fixed size so jsdom computes real scales. This
// exercises the actual chart integration — useXAxisScale / useYAxisScale /
// usePlotArea — and locks down the off-domain skip (markers outside the series
// time domain must render nothing). Mirrors SwimLane.render.test.tsx.

const ep = (t: string) => new Date(t).getTime();

// A three-point series spanning 10:00 → 12:00 on a numeric (epoch) x-axis.
const numData = [
  { time: '2026-05-20T10:00:00Z', value: 20 },
  { time: '2026-05-20T11:00:00Z', value: 22 },
  { time: '2026-05-20T12:00:00Z', value: 24 },
];
const numChartData = numData.map((d) => ({ t: ep(d.time), value: d.value }));
const series = numChartData.map((d) => ({ t: d.t, value: d.value as number | undefined }));

function ev(id: string, kind: PoolEvent['kind']): PoolEvent {
  const d = new Date(id);
  return {
    id,
    date: id.slice(0, 10),
    time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
    kind,
  };
}

// Kind icons (from EVENT_KINDS): chemical 🧪, water 💧, backwash 🔄, note 📝.
const CHEM = '🧪';
const WATER = '💧';
const BACKWASH = '🔄';
const NOTE = '📝';

// An event well inside the 10:00–12:00 domain.
const inDomain = ev('2026-05-20T11:00:00Z', 'chemical');
// An event AFTER the domain end — must be skipped (off-domain).
const afterDomain = ev('2026-05-20T18:00:00Z', 'water');
// An event BEFORE the domain start — must be skipped (off-domain).
const beforeDomain = ev('2026-05-20T06:00:00Z', 'backwash');

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

describe('EventLane (real Recharts render)', () => {
  it('renders a marker (with the kind icon) for an in-domain event', () => {
    const { container } = renderInChart(
      <EventLane events={[inDomain]} series={series} xMode="scale" />,
    );
    const fos = Array.from(container.querySelectorAll('foreignObject'));
    expect(fos.length).toBe(1);
    expect(container.textContent).toContain(CHEM);
  });

  it('renders NOTHING for an event whose epoch is after the series time domain', () => {
    const { container } = renderInChart(
      <EventLane events={[afterDomain]} series={series} xMode="scale" />,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
    expect(container.textContent).not.toContain(WATER);
  });

  it('renders NOTHING for an event whose epoch is before the series time domain', () => {
    const { container } = renderInChart(
      <EventLane events={[beforeDomain]} series={series} xMode="scale" />,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(0);
    expect(container.textContent).not.toContain(BACKWASH);
  });

  it('renders only the in-domain events when mixed with off-domain ones', () => {
    const { container } = renderInChart(
      <EventLane
        events={[beforeDomain, inDomain, afterDomain]}
        series={series}
        xMode="scale"
      />,
    );
    // Only the single in-domain event survives the tMin..tMax filter.
    expect(container.querySelectorAll('foreignObject').length).toBe(1);
    expect(container.textContent).toContain(CHEM);
    expect(container.textContent).not.toContain(WATER);
    expect(container.textContent).not.toContain(BACKWASH);
  });

  it('renders nothing when the series is empty', () => {
    const { container } = renderInChart(
      <EventLane events={[inDomain]} series={[]} xMode="scale" />,
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
        <EventLane events={[inDomain]} series={series} xMode="index" />
      </ComposedChart>,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(1);
    expect(container.textContent).toContain(CHEM);
  });

  it('renders the correct per-kind icon for different kinds', () => {
    const note = ev('2026-05-20T11:30:00Z', 'note');
    const { container } = renderInChart(
      <EventLane events={[note]} series={series} xMode="scale" />,
    );
    expect(container.querySelectorAll('foreignObject').length).toBe(1);
    expect(container.textContent).toContain(NOTE);
    expect(container.textContent).not.toContain(CHEM);
  });

  it('compact mode and full mode both render the icon but differ structurally (no stem/foot in compact)', () => {
    const full = renderInChart(
      <EventLane events={[inDomain]} series={series} xMode="scale" />,
    );
    const compact = renderInChart(
      <EventLane events={[inDomain]} series={series} xMode="scale" compact />,
    );

    // Both render exactly one marker carrying the kind icon.
    expect(full.container.querySelectorAll('foreignObject').length).toBe(1);
    expect(compact.container.querySelectorAll('foreignObject').length).toBe(1);
    expect(full.container.textContent).toContain(CHEM);
    expect(compact.container.textContent).toContain(CHEM);

    // Full mode adds a stem + foot (two aria-hidden spans) inside the marker;
    // compact mode adds none. Count the aria-hidden spans as the structural diff.
    const ariaHidden = (c: HTMLElement) =>
      c.querySelectorAll('span[aria-hidden="true"]').length;
    expect(ariaHidden(full.container)).toBe(2); // stem + foot
    expect(ariaHidden(compact.container)).toBe(0); // none
  });
});
