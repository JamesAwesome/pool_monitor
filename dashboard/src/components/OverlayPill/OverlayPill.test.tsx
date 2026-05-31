import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverlayPill } from './OverlayPill';

describe('OverlayPill', () => {
  it('reflects the active state via aria-pressed', () => {
    render(<OverlayPill label="Air" variant="air" active onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Air' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reflects the inactive state via aria-pressed', () => {
    render(<OverlayPill label="Pool" variant="pool" active={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pool' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn();
    render(<OverlayPill label="Pool" variant="pool" active={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pool' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
