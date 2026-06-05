import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SwimHistorySheet } from './SwimHistorySheet';
import type { SwimSession } from '../../types';

const swims: SwimSession[] = [
  { id: '1', date: '2026-05-10', time: '12:00', people: ['🦦'] },
  { id: '2', date: '2026-05-16', time: '14:00', people: ['🐢', '🦦'] },
];

describe('SwimHistorySheet', () => {
  it('shows the swim/dip summary and rows newest-first', () => {
    render(<SwimHistorySheet open swims={swims} onClose={() => {}} onSelect={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/2 swims · 3 dips/)).toBeInTheDocument();
  });

  it('switches to the leaderboard tab', () => {
    render(<SwimHistorySheet open swims={swims} onClose={() => {}} onSelect={() => {}} onNew={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /leaderboard/i }));
    expect(screen.getByText(/same person/i)).toBeInTheDocument();
  });

  it('calls onSelect when a swim row is tapped', () => {
    const onSelect = vi.fn();
    render(<SwimHistorySheet open swims={swims} onClose={() => {}} onSelect={onSelect} onNew={() => {}} />);
    fireEvent.click(screen.getAllByTestId('swim-hist-row')[0]);
    expect(onSelect).toHaveBeenCalledWith(swims[1]); // newest first → id '2'
  });
});
