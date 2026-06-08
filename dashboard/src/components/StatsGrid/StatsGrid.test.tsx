import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { StatsGrid } from './StatsGrid';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

const mockStats = {
  current: 25,
  currentTime: null,
  average: 24,
  peak: 30,
  seasonAvg: 23,
  seasonPeak: 32,
};

beforeEach(() => {
  globalThis.fetch = vi.fn((url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/season-history'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve([
        { year: 2026, average: 22.5, peak: 30.0, low: 10.0 },
        { year: 2025, average: null, peak: null, low: null },
      ]) });
    if (urlStr.includes('/api/stat-detail'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve([
        { start: '2026-04-02T00:00:00Z', stop: '2026-04-05T00:00:00Z', average: 22.5, high: 30.0, low: 10.0 },
        { start: '2026-03-30T00:00:00Z', stop: '2026-04-02T00:00:00Z', average: 21.0, high: 28.5, low: 9.5 },
        { start: '2026-03-27T00:00:00Z', stop: '2026-03-30T00:00:00Z', average: 20.0, high: 27.0, low: 8.0 },
      ]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  }) as unknown as typeof fetch;
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

  it('shows "Custom" label when range is a custom range', () => {
    render(<StatsGrid stats={mockStats} loading={false} range="custom:2026-04-01:2026-04-04" />);
    expect(screen.getByText('Average (Custom)')).toBeTruthy();
    expect(screen.getByText('Peak (Custom)')).toBeTruthy();
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

  it('opens average detail sheet when Average card is clicked', async () => {
    const user = userEvent.setup();
    render(<StatsGrid stats={mockStats} loading={false} range="3d" />);
    const cards = screen.getAllByTestId('stat-card');
    await user.click(cards[0]); // Average card
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Average History')).toBeTruthy();
  });

  it('opens peak detail sheet when Peak card is clicked', async () => {
    const user = userEvent.setup();
    render(<StatsGrid stats={mockStats} loading={false} range="3d" />);
    const cards = screen.getAllByTestId('stat-card');
    await user.click(cards[1]); // Peak card
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Temperature Extremes')).toBeTruthy();
  });

  it('shows Low column in season history table', async () => {
    const user = userEvent.setup();
    render(<StatsGrid stats={mockStats} loading={false} />);
    const cards = screen.getAllByTestId('stat-card');
    await user.click(cards[2]); // Season Avg card
    expect(screen.getByText('Low')).toBeTruthy();
  });
});
