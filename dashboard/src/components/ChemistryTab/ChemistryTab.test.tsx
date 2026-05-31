import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChemistryTab } from './ChemistryTab';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

function jsonResponse(data: unknown) { return { ok: true, json: async () => data } as Response; }

describe('ChemistryTab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/chemistry')) return Promise.resolve(jsonResponse([
        { date: '2026-05-20T16:00:00Z', ph: 7.5, fc: 3.0 },
        { date: '2026-05-29T16:00:00Z', ph: 7.7, fc: 4.0 },
      ]));
      return Promise.resolve(jsonResponse([]));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the six chemical cards', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument();
    expect(screen.getByText('CALCIUM HARDNESS')).toBeInTheDocument();
  });

  it('opens the focus sheet when a card is tapped', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument());
    await userEvent.click(screen.getByText('FREE CHLORINE'));
    // Focus sheet shows the Low/Avg/High stats
    await waitFor(() => expect(screen.getByText('Avg')).toBeInTheDocument());
  });

  it('toggles Pool and Air overlays independently (both on by default)', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    const pool = screen.getByRole('button', { name: 'Pool' });
    const air = screen.getByRole('button', { name: 'Air' });
    // Defaults: both on
    expect(pool).toHaveAttribute('aria-pressed', 'true');
    expect(air).toHaveAttribute('aria-pressed', 'true');
    // Turn Air off without affecting Pool
    await userEvent.click(air);
    expect(air).toHaveAttribute('aria-pressed', 'false');
    expect(pool).toHaveAttribute('aria-pressed', 'true');
    // Turn Pool off independently
    await userEvent.click(pool);
    expect(pool).toHaveAttribute('aria-pressed', 'false');
    expect(air).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the unlock sheet from Log test when locked', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /log test/i }));
    expect(screen.getByText(/Unlock to log a test/i)).toBeInTheDocument();
  });
});
