import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar } from './TabBar';

describe('TabBar', () => {
  it('marks the active tab as pressed', () => {
    render(<TabBar active="temperature" onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Temperature' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Chemistry' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onChange when a tab is clicked', async () => {
    const onChange = vi.fn();
    render(<TabBar active="temperature" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Chemistry' }));
    expect(onChange).toHaveBeenCalledWith('chemistry');
  });
});
