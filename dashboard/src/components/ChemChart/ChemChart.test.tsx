import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart } from './ChemChart';
import { buildChartData } from './buildChartData';

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

  it('reserves top headroom in the full variant only when a reading-day has weather', () => {
    // reading[0] is on 2026-05-20; give that UTC day a condition so the lane shows.
    const air = [{ time: '2026-05-20T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' }];
    const { rerender } = render(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={air} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('22');

    // No matching weather → no lane → no extra headroom.
    rerender(
      <ChemChart readings={readings} chemKey="ph" color="#000" decimals={1}
        poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="full" />,
    );
    expect(screen.getByTestId('composed').getAttribute('data-margin-top')).toBe('8');
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
