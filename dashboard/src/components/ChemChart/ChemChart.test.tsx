import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart } from './ChemChart';
import { buildChartData } from './buildChartData';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
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
