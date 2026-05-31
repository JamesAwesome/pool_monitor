import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemCard } from './ChemCard';
import { CHEM_BY_KEY } from '../../constants/chemicals';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

const readings = [
  { date: '2026-05-20T16:00:00Z', fc: 3.0 },
  { date: '2026-05-29T16:00:00Z', fc: 4.0 },
];

function renderCard(onOpen = vi.fn()) {
  render(
    <ChemCard meta={CHEM_BY_KEY.fc} readings={readings}
      poolHistory={[]} airHistory={[]} overlay="off" onOpen={onOpen} />,
  );
  return onOpen;
}

describe('ChemCard', () => {
  it('shows the name, latest value, and unit', () => {
    renderCard();
    expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText('ppm')).toBeInTheDocument();
  });

  it('calls onOpen when tapped', async () => {
    const onOpen = renderCard();
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('fc');
  });

  it('renders -- when no reading exists for the chemical', () => {
    render(
      <ChemCard meta={CHEM_BY_KEY.ch} readings={readings}
        poolHistory={[]} airHistory={[]} overlay="off" onOpen={vi.fn()} />,
    );
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
