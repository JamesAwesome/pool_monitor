import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChemChart } from './ChemChart';
import { ThemeProvider } from '../../context/ThemeContext';

const readings = [
  { date: '2026-05-20T16:00:00Z', ph: 7.5 },
  { date: '2026-05-29T16:00:00Z', ph: 7.7 },
];

describe('ChemChart', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('renders a chart container for the chemical', () => {
    render(
      <ThemeProvider>
        <ChemChart readings={readings} chemKey="ph" color="oklch(0.58 0.15 260)" decimals={1}
          poolHistory={[]} airHistory={[]} showPool={false} showAir={false} variant="mini" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('chem-chart-ph')).toBeInTheDocument();
  });
});
