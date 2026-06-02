import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistorySheet } from './HistorySheet';

const readings = [
  { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6, ph: 7.6 },
  { id: '2026-05-20T20:30:00Z', date: '2026-05-20', time: '16:30', fc: 6.8, ph: 7.4 },
  { id: '2026-05-24T12:35:00Z', date: '2026-05-24', time: '08:35', fc: 2.9 },
];

describe('HistorySheet', () => {
  it('lists all tests newest-first with a count subtitle', () => {
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} />);
    expect(screen.getByText(/3 tests logged/i)).toBeInTheDocument();
    const times = screen.getAllByText(/AM|PM/);
    expect(times[0]).toHaveTextContent('8:35 AM'); // newest (May 24) first
  });
  it('shows a +N badge when a day has multiple tests', () => {
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={vi.fn()} onNew={vi.fn()} />);
    // May 20 has 2 tests — both rows get the +1 badge
    const badges = screen.getAllByText('+1');
    expect(badges.length).toBe(2);
  });
  it('calls onSelect with the reading when a row is tapped', async () => {
    const onSelect = vi.fn();
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={onSelect} onNew={vi.fn()} />);
    await userEvent.click(screen.getByText('8:35 AM').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2026-05-24T12:35:00Z' }));
  });
  it('calls onNew from the log-new button', async () => {
    const onNew = vi.fn();
    render(<HistorySheet open readings={readings} onClose={vi.fn()} onSelect={vi.fn()} onNew={onNew} />);
    await userEvent.click(screen.getByRole('button', { name: /log a new test/i }));
    expect(onNew).toHaveBeenCalled();
  });
});
