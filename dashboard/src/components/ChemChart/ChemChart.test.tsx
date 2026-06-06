import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart, laneFromAirHistory, weatherAtReadings } from './ChemChart';
import { buildChartData, extendTempToEdge, type ChartPoint } from './buildChartData';
import type { WeatherHistoryPoint } from '../../types';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

// Mock recharts so we can assert chart wiring (margin headroom) deterministically.
// The real lane glyph rendering on a numeric time axis is covered against real
// Recharts in ../WeatherLane/WeatherLane.render.test.tsx.
const { tooltipSpy } = vi.hoisted(() => ({ tooltipSpy: vi.fn(() => null) }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children, margin }: { children: React.ReactNode; margin?: { top?: number } }) => (
    <div data-testid="composed" data-margin-top={margin?.top}>{children}</div>
  ),
  Area: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: tooltipSpy,
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

  it('renders the hover Tooltip only on the full variant', () => {
    tooltipSpy.mockClear();
    render(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="mini" />,
    );
    expect(tooltipSpy).not.toHaveBeenCalled();

    tooltipSpy.mockClear();
    render(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="full" />,
    );
    expect(tooltipSpy).toHaveBeenCalled();
  });

  it('reserves headroom scaling with the number of weather lane rows', () => {
    // Air line off → x-domain = readings span [05-20T16:00 .. 05-29T16:00].
    // Weather within span → ambient row (1) + per-reading row (1) = 2 rows.
    const within: WeatherHistoryPoint[] = [
      { time: '2026-05-22T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
    ];
    const { rerender } = render(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={within} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('40');

    // Weather only OUTSIDE the visible span → ambient lane clipped away, but the
    // readings still get their nearest weather → 1 row.
    const outside: WeatherHistoryPoint[] = [
      { time: '2026-05-10T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
    ];
    rerender(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={outside} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('22');

    // No weather data at all → no lanes, no headroom.
    rerender(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('8');
  });
});

describe('weatherAtReadings', () => {
  const air: WeatherHistoryPoint[] = [
    { time: '2026-05-20T09:00:00Z', value: 20, conditionCode: 1000, condition: 'Sunny' },
    { time: '2026-05-20T15:00:00Z', value: 24, conditionCode: 1006, condition: 'Cloudy' },
    { time: '2026-05-21T09:00:00Z', value: 21, conditionCode: 1063, condition: 'Rain' },
  ];

  it('tags each reading with the nearest-in-time weather condition', () => {
    const rs = [
      { id: '2026-05-20T14:30:00Z', date: '2026-05-20', time: '10:30', ph: 7.5 }, // nearest 15:00 cloudy
      { id: '2026-05-21T08:30:00Z', date: '2026-05-21', time: '04:30', ph: 7.6 }, // nearest 09:00 rain
    ];
    const out = weatherAtReadings(rs, air);
    expect(out.map((p) => p.conditionCode)).toEqual([1006, 1063]);
    expect(out[0].time).toBe('2026-05-20T14:30:00Z'); // positioned at the reading
    expect(out[0].condition).toBe('Cloudy');
  });

  it('returns one point per reading (no collapsing of same conditions)', () => {
    const rs = [
      { id: '2026-05-20T09:05:00Z', date: '2026-05-20', time: '05:05', ph: 7.5 },
      { id: '2026-05-20T09:10:00Z', date: '2026-05-20', time: '05:10', ph: 7.6 },
    ];
    expect(weatherAtReadings(rs, air)).toHaveLength(2); // both sunny, both kept
  });

  it('returns [] when there is no weather data', () => {
    expect(weatherAtReadings(readings, [])).toEqual([]);
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

describe('extendTempToEdge', () => {
  const t = (s: string) => new Date(s).getTime();
  // Daily-mean temp buckets end at UTC midnight; the chart edge is later (a chem
  // reading / marker), so the temp curves stop short of the edge.
  const base: ChartPoint[] = [
    { t: t('2026-06-05T00:00:00Z'), pool: 74, air: 70 },
    { t: t('2026-06-06T00:00:00Z'), pool: 76.8, air: 78.3 },
    { t: t('2026-06-06T14:24:00Z'), chem: 7.3 }, // latest reading defines the edge
  ];
  const edge = t('2026-06-06T14:44:00Z');

  it('appends a temp point at the edge using the live current values', () => {
    const out = extendTempToEdge(base, edge, { poolValue: 77.5, airValue: 89.1 });
    const last = out[out.length - 1];
    expect(last.t).toBe(edge);
    expect(last.pool).toBe(77.5);
    expect(last.air).toBe(89.1);
  });

  it('merges into an existing point when one already sits at the edge', () => {
    const out = extendTempToEdge(base, t('2026-06-06T14:24:00Z'), { poolValue: 77.5, airValue: 89.1 });
    const atReading = out.filter((p) => p.t === t('2026-06-06T14:24:00Z'));
    expect(atReading).toHaveLength(1); // no duplicate x
    expect(atReading[0].chem).toBe(7.3); // chem preserved
    expect(atReading[0].pool).toBe(77.5);
  });

  it('does not extend when the temp series already reaches the edge', () => {
    const reach: ChartPoint[] = [{ t: t('2026-06-06T14:44:00Z'), pool: 77.5, air: 89.1 }];
    expect(extendTempToEdge(reach, edge, { poolValue: 77.5, airValue: 89.1 })).toEqual(reach);
  });

  it('is a no-op when no temp values are available', () => {
    expect(extendTempToEdge(base, edge, { poolValue: null, airValue: null })).toBe(base);
  });

  it('is a no-op when the edge is not numeric', () => {
    expect(extendTempToEdge(base, null, { poolValue: 77.5, airValue: 89.1 })).toBe(base);
  });
});
