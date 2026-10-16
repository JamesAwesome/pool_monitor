import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SeasonSummary, SeasonSummaryView } from './SeasonSummary';
import type { SeasonSummaryViewProps } from './SeasonSummary';
import { ThemeProvider } from '../../context/ThemeContext';
import { emptySummary, fullSummary } from '../../test/seasonSummaryFixture';

function view(overrides: Partial<SeasonSummaryViewProps> = {}) {
  const props: SeasonSummaryViewProps = {
    year: 2026, maxYear: 2026, onYearChange: vi.fn(), summary: fullSummary(), loading: false, error: null, unit: 'F',
    ...overrides,
  };
  render(<SeasonSummaryView {...props} />);
  return props;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('SeasonSummaryView', () => {
  it('renders the marquee, top bar and high-score table', () => {
    view();
    expect(screen.getByRole('heading', { name: 'SEASON 2026' })).toBeInTheDocument();
    expect(screen.getByText('000095')).toBeInTheDocument(); // dips
    expect(screen.getByText('000050')).toBeInTheDocument(); // doses
    const rows = screen.getAllByTestId('score-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('1ST🦦00038');
  });

  it('renders every stage and the achievements', () => {
    view();
    for (const name of ['WATER TEMP', 'CHEMISTRY', 'MAINTENANCE', 'WEATHER', 'SWIMS', 'Achievements unlocked']) {
      expect(screen.getByRole('region', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
    expect(screen.getByText('Liquid chlorine')).toBeInTheDocument();
    expect(screen.getByText('pH avg')).toBeInTheDocument();
    expect(screen.getByText(/was the swim champ/)).toBeInTheDocument();
  });

  it('hides weather and temp stages when that data is missing', () => {
    const s = fullSummary();
    s.pool = null; s.air = null; s.sky = null;
    view({ summary: s });
    expect(screen.queryByRole('region', { name: 'WATER TEMP' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'WEATHER' })).toBeNull();
    expect(screen.getByText('---')).toBeInTheDocument();
  });

  it('shows loading, error, and empty states', () => {
    const { unmount } = render(<SeasonSummaryView year={2026} maxYear={2026} onYearChange={vi.fn()} summary={null} loading error={null} unit="F" />);
    expect(screen.getByText('LOADING…')).toBeInTheDocument();
    unmount();
    view({ summary: null, error: 'boom' });
    expect(screen.getByText(/TILT!/)).toBeInTheDocument();
  });

  it('says no players for an empty season, and no swimmers table', () => {
    view({ summary: emptySummary() });
    expect(screen.getByText('NO PLAYERS THIS SEASON')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'High scores' })).toBeNull();
  });

  it('shows NO SWIMMERS when other data exists but no swims', () => {
    const s = fullSummary();
    s.swims = emptySummary().swims;
    view({ summary: s });
    expect(screen.getByText('NO SWIMMERS LOGGED')).toBeInTheDocument();
  });

  it('navigates years and disables next at the current year', () => {
    const props = view();
    expect(screen.getByRole('button', { name: 'Next season' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous season' }));
    expect(props.onYearChange).toHaveBeenCalledWith(2025);
  });
});

describe('SeasonSummary (connected)', () => {
  it('fetches the current year and refetches when stepping back', async () => {
    const year = new Date().getFullYear();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ ...fullSummary(), year: Number(new URL(url, 'http://x').searchParams.get('year')) }),
    })) as unknown as typeof fetch);
    render(<ThemeProvider><SeasonSummary /></ThemeProvider>);
    await waitFor(() => expect(screen.getAllByTestId('score-row').length).toBeGreaterThan(0));
    expect(fetch).toHaveBeenCalledWith(`/api/season-summary?year=${year}`);
    fireEvent.click(screen.getByRole('button', { name: 'Previous season' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/api/season-summary?year=${year - 1}`));
    expect(screen.getByRole('heading', { name: `SEASON ${year - 1}` })).toBeInTheDocument();
  });
});
