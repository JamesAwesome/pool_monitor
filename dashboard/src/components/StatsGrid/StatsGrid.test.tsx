import { render, screen } from '@testing-library/react';
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

describe('StatsGrid', () => {
  it('renders all 4 stat cards with data', () => {
    render(<StatsGrid stats={mockStats} loading={false} />);
    const cards = screen.getAllByTestId('stat-card');
    expect(cards).toHaveLength(4);
    expect(screen.getByText('Average')).toBeTruthy();
    expect(screen.getByText('Peak')).toBeTruthy();
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
});
