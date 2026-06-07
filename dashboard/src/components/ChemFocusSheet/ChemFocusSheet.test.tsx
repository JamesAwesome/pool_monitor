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
    expect(swimPill).toHaveAttribute('aria-pressed', 'false'); // default off on chem page
    await userEvent.click(swimPill);
    expect(swimPill).toHaveAttribute('aria-pressed', 'true');
  });

  const sampleEvents = [
    { id: '2026-05-29T16:00:00Z', date: '2026-05-29', time: '12:00', kind: 'chemical' as const },
  ];

  it('does not render the Events overlay pill when no events are provided', () => {
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Events' })).toBeNull();
  });

  it('renders the Events overlay pill only when events exist, and toggles it', async () => {
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={[]} airHistory={[]} events={sampleEvents} onClose={vi.fn()} />,
    );
    const eventsPill = screen.getByRole('button', { name: 'Events' });
    expect(eventsPill).toHaveAttribute('aria-pressed', 'true'); // default on on chem page
    await userEvent.click(eventsPill);
    expect(eventsPill).toHaveAttribute('aria-pressed', 'false');
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

  it('uses live current temps for the now legend, not the last (aggregated) history bucket', () => {
    // History last points are coarse daily-mean buckets (season/all range), which
    // lag the real "now" — especially air on a hot afternoon.
    const poolHistory = [{ time: '2026-06-06T00:00:00Z', value: 24.9 }]; // → 76.8°F
    const airHistory = [{ time: '2026-06-06T00:00:00Z', value: 25.7 }];  // → 78.3°F
    render(
      <ChemFocusSheet meta={CHEM_BY_KEY.fc} readings={readings}
        poolHistory={poolHistory} airHistory={airHistory}
        poolCurrent={25.3} airCurrent={30.8} onClose={vi.fn()} />,
    );
    // Live values win: 25.3°C → 77.5°F, 30.8°C → 87.4°F
    expect(screen.getByText(/77\.5°F/)).toBeInTheDocument();
    expect(screen.getByText(/87\.4°F/)).toBeInTheDocument();
    // Stale daily-mean values must not be shown as "now"
    expect(screen.queryByText(/76\.8°F/)).toBeNull();
    expect(screen.queryByText(/78\.3°F/)).toBeNull();
  });
});
