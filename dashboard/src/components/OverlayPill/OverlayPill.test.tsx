import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  describe('swim variant', () => {
    it('renders the 🦦 swatch and reflects active via aria-pressed', () => {
      render(<OverlayPill variant="swim" label="Swim" active onToggle={vi.fn()} />);
      const pill = screen.getByRole('button', { name: 'Swim' });
      expect(pill).toHaveAttribute('aria-pressed', 'true');
      expect(pill).toHaveTextContent('🦦');
    });

    it('reflects the inactive state via aria-pressed', () => {
      render(<OverlayPill variant="swim" label="Swim" active={false} onToggle={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Swim' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls onToggle when clicked', async () => {
      const onToggle = vi.fn();
      render(<OverlayPill variant="swim" label="Swim" active onToggle={onToggle} />);
      await userEvent.click(screen.getByRole('button', { name: 'Swim' }));
      expect(onToggle).toHaveBeenCalledOnce();
    });
  });

  it('renders the events variant with a 🧰 swatch and reflects active', () => {
    const onToggle = vi.fn();
    render(<OverlayPill label="Events" variant="events" active onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: /events/i });
    expect(btn).toHaveTextContent('🧰');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalled();
  });
});
