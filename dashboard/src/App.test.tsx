import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach } from 'vitest';
import App from './App';
import { emptySummary } from './test/seasonSummaryFixture';

vi.mock('./hooks/usePoolData', () => ({
  usePoolData: () => ({
    stats: { current: 25.0, average: 24.0, peak: 27.0, seasonAvg: 23.0, seasonPeak: 28.0 },
    history: [{ time: '2026-04-04T10:00:00Z', value: 25.0 }],
    batteries: [{ id: '29908', model: 'Inkbird-ITH20R', current: 100 }],
    range: '3d',
    setRange: vi.fn(),
    loading: false,
    error: null,
    sensors: [{ id: '29908', model: 'Inkbird-ITH20R' }],
    selectedSensor: null,
    setSelectedSensor: vi.fn(),
    airCurrent: null,
    airHistory: [],
  }),
}));

vi.mock('./context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({
    theme: 'light' as const,
    toggleTheme: vi.fn(),
    unit: 'F' as const,
    toggleUnit: vi.fn(),
  }),
}));

describe('App', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  });

  it('renders the header', () => {
    render(<App />);
    expect(screen.getByText('Pool Dashboard')).toBeTruthy();
  });

  it('renders the current temperature', async () => {
    render(<App />);
    expect(await screen.findByText('Current Pool Temperature')).toBeTruthy();
  });

  it('renders stat cards', async () => {
    render(<App />);
    expect(await screen.findByText(/Average \(3D\)/)).toBeTruthy();
    expect(screen.getByText(/Peak \(3D\)/)).toBeTruthy();
  });

  it('renders the footer', () => {
    render(<App />);
    expect(screen.getByText(/Pool Monitor/)).toBeTruthy();
  });

  it('does not show error when none exists', () => {
    render(<App />);
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it('switches to the Chemistry tab', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Chemistry' }));
    expect(await screen.findByRole('heading', { name: 'Chemistry' })).toBeInTheDocument();
  });

  it('waits for the mode before rendering a tab', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<App />);
    expect(screen.queryByText('Current Pool Temperature')).toBeNull();
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  describe('off-season mode', () => {
    function offSeasonFetch() {
      globalThis.fetch = vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url === '/api/mode' ? { offSeason: true, latestYear: 2025 }
          : url.startsWith('/api/season-summary') ? emptySummary(2025) : []),
      })) as unknown as typeof fetch;
    }

    it('opens on the Season tab at the latest data year', async () => {
      offSeasonFetch();
      render(<App />);
      expect(await screen.findByRole('heading', { name: 'SEASON 2025' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Season' })).toHaveAttribute('aria-selected', 'true');
    });

    it('shows a paused-recording notice on the Temperature tab', async () => {
      offSeasonFetch();
      render(<App />);
      await screen.findByRole('heading', { name: 'SEASON 2025' });
      await userEvent.click(screen.getByRole('tab', { name: 'Temperature' }));
      expect(screen.getByRole('status')).toHaveTextContent(/recording is paused/);
    });

    it('shows no notice in season', async () => {
      render(<App />);
      await screen.findByText('Current Pool Temperature');
      expect(screen.queryByText(/recording is paused/)).toBeNull();
    });
  });
});
