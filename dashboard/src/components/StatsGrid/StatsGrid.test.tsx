import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { StatsGrid } from './StatsGrid';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

const mockStats = {
  current: 25,
  average: 24,
  peak: 30,
  seasonAvg: 23,
  seasonPeak: 32,
};

beforeEach(() => {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve([
      { year: 2026, average: 22.5, peak: 30.0 },
      { year: 2025, average: null, peak: null },
    ]) })
  ) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StatsGrid', () => {
  it('renders all 4 stat cards with data', () => {
    render(<StatsGrid stats={mockStats} loading={false} />);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
    expect(screen.getByText('Average (3D)')).toBeTruthy();
    expect(screen.getByText('Peak (3D)')).toBeTruthy();
    expect(screen.getByText('Season Avg (YTD)')).toBeTruthy();
    expect(screen.getByText('Season Peak (YTD)')).toBeTruthy();
  });

  it('renders 4 cards in loading state', () => {
    render(<StatsGrid stats={null} loading={true} />);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
    const dashes = screen.getAllByText('--');
    expect(dashes).toHaveLength(4);
  });

  it('renders 4 cards when stats is null and not loading', () => {
    render(<StatsGrid stats={null} loading={false} />);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
  });

  it('opens season history sheet when season card is clicked', async () => {
    const user = userEvent.setup();
    render(<StatsGrid stats={mockStats} loading={false} />);

    // Click the Season Avg card (3rd card)
    const cards = screen.getAllByTestId('stat-card');
    await user.click(cards[2]);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Season History')).toBeTruthy();
  });
});
