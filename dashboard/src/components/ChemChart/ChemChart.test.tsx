import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart } from './ChemChart';

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
