import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemFocusSheet } from './ChemFocusSheet';
import { CHEM_BY_KEY } from '../../constants/chemicals';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

const readings = [
  { id: '2026-05-20T16:00:00Z', date: '2026-05-20', time: '12:00', fc: 3.0 },
  { id: '2026-05-29T16:00:00Z', date: '2026-05-29', time: '12:00', fc: 4.0 },
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

  const swims = [
    { id: '2026-05-29T16:00:00Z', date: '2026-05-29', time: '12:00', people: ['🦦'] },
  ];

  it('does not render the Swim overlay pill when no swims are provided', () => {
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Swim' })).toBeNull();
  });

  it('renders the Swim overlay pill only when swims exist, and toggles it', async () => {
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} swims={swims} onClose={vi.fn()} />,
    );
    const swimPill = screen.getByRole('button', { name: 'Swim' });
    expect(swimPill).toHaveAttribute('aria-pressed', 'true'); // default on
    await userEvent.click(swimPill);
    expect(swimPill).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows pool now legend when Pool overlay is on and poolHistory has data', () => {
    // poolHistory last value: 28.89°C → 84.0°F (unit mock returns 'F')
    const poolHistory = [
      { time: '2026-05-29T12:00:00Z', value: 27.0 },
      { time: '2026-05-29T16:00:00Z', value: 28.89 },
    ];
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={poolHistory} airHistory={[]} onClose={vi.fn()} />,
    );
    expect(screen.getByText(/pool now/i)).toBeInTheDocument();
    // 28.89°C → 84.0°F
    expect(screen.getByText(/84\.0°F/)).toBeInTheDocument();
  });
});
