import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart, laneFromAirHistory } from './ChemChart';
import { buildChartData } from './buildChartData';
import type { WeatherHistoryPoint } from '../../types';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

// Mock recharts so we can assert chart wiring (margin headroom) deterministically.
// The real lane glyph rendering on a numeric time axis is covered against real
// Recharts in ../WeatherLane/WeatherLane.render.test.tsx.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, margin }: { children: React.ReactNode; margin?: { top?: number } }) => (
    <div data-testid="composed" data-margin-top={margin?.top}>{children}</div>
  ),
  Area: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  useXAxisScale: () => undefined,
  usePlotArea: () => undefined,
}));

const readings = [
  { id: '2026-05-20T16:00:00Z', date: '2026-05-20', time: '12:00', ph: 7.5 },
  { id: '2026-05-29T16:00:00Z', date: '2026-05-29', time: '12:00', ph: 7.7 },
];

describe('ChemChart', () => {
  it('renders a chart container for the chemical', () => {
    render(
      <ChemChart readings={readings} chemKey="ph" color="oklch(0.58 0.15 260)" decimals={1}
        poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="mini" />,
    );
    expect(screen.getByTestId('chem-chart-ph')).toBeInTheDocument();
  });

  it('reserves top headroom in the full variant when weather falls within the charted span', () => {
    // Air line off → x-domain = readings span [05-20T16:00 .. 05-29T16:00].
    const within: WeatherHistoryPoint[] = [
      { time: '2026-05-22T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
    ];
    const { rerender } = render(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={within} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('22');

    // Weather only OUTSIDE the charted span → clipped away → no lane, no headroom.
    const outside: WeatherHistoryPoint[] = [
      { time: '2026-05-10T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
    ];
    rerender(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={outside} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('8');
  });
});

describe('laneFromAirHistory', () => {
  const t = (s: string) => new Date(s).getTime();
  const air: WeatherHistoryPoint[] = [
    { time: '2026-05-20T10:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
    { time: '2026-05-20T11:00:00Z', value: 21, conditionCode: 1000, condition: 'Sunny' },
    { time: '2026-05-20T12:00:00Z', value: 22, conditionCode: 1006, condition: 'Cloudy' },
    { time: '2026-05-20T13:00:00Z', value: 22, conditionCode: 1000, condition: 'Sunny' },
  ];

  it('collapses to one icon per change across the full range', () => {
    const out = laneFromAirHistory(air, t('2026-05-20T10:00:00Z'), t('2026-05-20T13:00:00Z'));
    expect(out.map((p) => p.conditionCode)).toEqual([1000, 1006, 1000]);
  });

  it('clips to the visible domain before collapsing', () => {
    // Domain 11:30..12:30 → only the cloudy point is in view.
    const out = laneFromAirHistory(air, t('2026-05-20T11:30:00Z'), t('2026-05-20T12:30:00Z'));
    expect(out.map((p) => p.conditionCode)).toEqual([1006]);
  });

  it('returns [] when no weather falls within the domain', () => {
    expect(laneFromAirHistory(air, t('2026-06-01T00:00:00Z'), t('2026-06-02T00:00:00Z'))).toEqual([]);
  });
});

describe('buildChartData', () => {
  it('renders two same-day readings as two distinct x points', () => {
    const sameDayReadings = [
      { id: '2026-05-20T11:50:00.000Z', date: '2026-05-20', time: '07:50', fc: 3.6 },
      { id: '2026-05-20T20:30:00.000Z', date: '2026-05-20', time: '16:30', fc: 6.8 },
    ];
    const data = buildChartData(sameDayReadings, 'fc', [], [], false, false, false);
    expect(data).toHaveLength(2);
    expect(data[0].t).toBe(new Date('2026-05-20T11:50:00.000Z').getTime());
    expect(data[1].t).toBe(new Date('2026-05-20T20:30:00.000Z').getTime());
    expect(data[0].chem).toBe(3.6);
    expect(data[1].chem).toBe(6.8);
  });

  it('keys different days as separate points', () => {
    const data = buildChartData(readings, 'ph', [], [], false, false, false);
    expect(data).toHaveLength(2);
    expect(data[0].t).not.toBe(data[1].t);
  });
});
