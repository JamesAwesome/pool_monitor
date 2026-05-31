import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemFocusSheet } from './ChemFocusSheet';
import { CHEM_BY_KEY } from '../../constants/chemicals';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

const readings = [
  { date: '2026-05-20T16:00:00Z', fc: 3.0 },
  { date: '2026-05-29T16:00:00Z', fc: 4.0 },
];

describe('ChemFocusSheet', () => {
  it('shows the chemical name, value, and Low/Avg/High stats', () => {
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} onClose={vi.fn()} />,
    );
    expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Avg')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('toggles the Pool overlay pill', async () => {
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} onClose={vi.fn()} />,
    );
    const poolPill = screen.getByRole('button', { name: /pool temp/i });
    expect(poolPill).toHaveAttribute('aria-pressed', 'true'); // default on
    await userEvent.click(poolPill);
    expect(poolPill).toHaveAttribute('aria-pressed', 'false');
  });
});
