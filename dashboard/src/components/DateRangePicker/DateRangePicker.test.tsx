import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { DateRangePicker } from './DateRangePicker';

describe('DateRangePicker', () => {
  it('renders month navigation and day names', () => {
    render(<DateRangePicker onApply={vi.fn()} />);
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
    expect(screen.getByLabelText('Next month')).toBeTruthy();
    expect(screen.getByText('Su')).toBeTruthy();
    expect(screen.getByText('Sa')).toBeTruthy();
  });

  it('shows current month label', () => {
    render(<DateRangePicker onApply={vi.fn()} />);
    const now = new Date();
    const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    expect(screen.getByText(monthLabel)).toBeTruthy();
  });

  it('navigates to previous month', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker onApply={vi.fn()} />);
    await user.click(screen.getByLabelText('Previous month'));
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const label = prev.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows prompt text before selection', () => {
    render(<DateRangePicker onApply={vi.fn()} />);
    expect(screen.getByText('Tap a start date')).toBeTruthy();
  });

  it('selects a start date on first click', async () => {
    const user = userEvent.setup();
    render(<DateRangePicker onApply={vi.fn()} />);
    const dayButtons = screen.getAllByRole('button').filter(
      (b) => !b.hasAttribute('aria-label') && b.textContent !== 'Apply'
    );
    // Click the first enabled day
    const firstDay = dayButtons.find((b) => !b.hasAttribute('disabled'));
    if (firstDay) {
      await user.click(firstDay);
      expect(screen.getByText(/pick end/)).toBeTruthy();
    }
  });

  it('apply button is disabled until range is selected', () => {
    render(<DateRangePicker onApply={vi.fn()} />);
    const applyBtn = screen.getByText('Apply');
    expect(applyBtn).toBeDisabled();
  });

  it('swaps dates when end date is before start date', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<DateRangePicker onApply={onApply} />);

    // Navigate to previous month so all days are in the past
    await user.click(screen.getByLabelText('Previous month'));
    await user.click(screen.getByLabelText('Previous month'));

    const dayButtons = screen.getAllByRole('button').filter(
      (b) => !b.hasAttribute('aria-label') && b.textContent !== 'Apply' && !b.hasAttribute('disabled')
    );

    if (dayButtons.length >= 2) {
      // Click a later date first, then an earlier date
      await user.click(dayButtons[dayButtons.length - 1]); // last day
      await user.click(dayButtons[0]); // first day
      await user.click(screen.getByText('Apply'));

      expect(onApply).toHaveBeenCalledOnce();
      const [from, to] = onApply.mock.calls[0];
      // from should be the earlier date, to should be the later date
      expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
    }
  });

  it('calls onApply with date strings when range selected', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<DateRangePicker onApply={onApply} />);

    // Navigate to previous month so all days are in the past
    await user.click(screen.getByLabelText('Previous month'));

    const dayButtons = screen.getAllByRole('button').filter(
      (b) => !b.hasAttribute('aria-label') && b.textContent !== 'Apply' && !b.hasAttribute('disabled')
    );

    if (dayButtons.length >= 2) {
      await user.click(dayButtons[0]);
      await user.click(dayButtons[dayButtons.length - 1]);
      await user.click(screen.getByText('Apply'));
      expect(onApply).toHaveBeenCalledOnce();
      const [from, to] = onApply.mock.calls[0];
      expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
