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
        { id: '2026-05-20T16:00:00.000Z', date: '2026-05-20', time: '12:00', ph: 7.5, fc: 3.0 },
        { id: '2026-05-29T16:00:00.000Z', date: '2026-05-29', time: '12:00', ph: 7.7, fc: 4.0 },
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

  it('range buttons change the active selection', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    // "Season" is the default — clicking "30D" should switch to it
    const btn30d = screen.getByRole('button', { name: '30D' });
    await userEvent.click(btn30d);
    // After clicking 30D, clicking "All" should also work without error
    const btnAll = screen.getByRole('button', { name: 'All' });
    await userEvent.click(btnAll);
    // No assertion on class (CSS modules are opaque in tests), but we verify
    // the fetch was re-triggered with the new range
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('range=all')
    ));
  });

  it('Custom button opens the bottom sheet with the date range picker', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: 'Custom range' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
  });

  it('Custom button toggles the bottom sheet off on second click', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.queryByRole('dialog', { name: 'Custom range' })).toBeNull();
  });

  it('DateRangePicker in custom sheet fires onApply and closes the sheet', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();

    // Navigate to previous month so multiple past days are available
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    const allDayButtons = screen.getAllByRole('button').filter(
      (b) => !b.hasAttribute('disabled') && /^\d+$/.test((b.textContent ?? '').trim())
    );
    expect(allDayButtons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(allDayButtons[0]);
    await userEvent.click(allDayButtons[Math.min(4, allDayButtons.length - 1)]);

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).not.toBeDisabled();
    await userEvent.click(applyBtn);

    // Sheet should close and a custom range fetch should be triggered
    expect(screen.queryByRole('dialog', { name: 'Custom range' })).toBeNull();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('range=custom%3A')
    ));
  });

  it('closing a quick range button hides the custom sheet when it was open', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '90D' }));
    expect(screen.queryByRole('dialog', { name: 'Custom range' })).toBeNull();
  });

  it('closes the focus sheet when its close button is clicked', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('FREE CHLORINE')).toBeInTheDocument());
    await userEvent.click(screen.getByText('FREE CHLORINE'));
    await waitFor(() => expect(screen.getByText('Avg')).toBeInTheDocument());
    // BottomSheet renders a close button with aria-label="Close"
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('Avg')).toBeNull());
  });

  it('opens the History sheet from the History button', async () => {
    render(<ChemistryTab />);
    await waitFor(() => expect(screen.getByText('PH')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /history/i }));
    expect(await screen.findByText(/tests logged/i)).toBeInTheDocument();
  });
});
