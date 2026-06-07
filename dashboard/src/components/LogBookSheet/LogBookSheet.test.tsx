import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LogBookSheet } from './LogBookSheet';
import type { PoolEvent } from '../../types';

const events: PoolEvent[] = [
  { id: '1', date: '2026-05-10', time: '12:00', kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' },
  { id: '2', date: '2026-05-16', time: '14:00', kind: 'water', amount: 2, unit: 'in' },
];

describe('LogBookSheet', () => {
  it('shows the entry count and newest-first rows', () => {
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
    expect(screen.getByText('Added water · 2 in')).toBeInTheDocument();
  });
  it('filters by kind', () => {
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={() => {}} onNew={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /water/i }));
    expect(screen.queryByText('Cal-hypo · 16 oz')).not.toBeInTheDocument();
    expect(screen.getByText('Added water · 2 in')).toBeInTheDocument();
  });
  it('calls onEdit with the tapped event', () => {
    const onEdit = vi.fn();
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={onEdit} onNew={() => {}} />);
    fireEvent.click(screen.getByText('Added water · 2 in'));
    expect(onEdit).toHaveBeenCalledWith(events[1]); // newest first
  });
  it('lists each chemical line for a multi-item event', () => {
    const events: PoolEvent[] = [
      { id: '3', date: '2026-05-20', time: '10:00', kind: 'chemical', items: [
        { product: 'Liquid chlorine', amount: 48, unit: 'oz' },
        { product: 'Muriatic acid', amount: 16, unit: 'oz' },
      ] },
    ];
    render(<LogBookSheet open events={events} onClose={() => {}} onEdit={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/Liquid chlorine · 48 oz/)).toBeInTheDocument();
    expect(screen.getByText(/Muriatic acid · 16 oz/)).toBeInTheDocument();
  });
});
