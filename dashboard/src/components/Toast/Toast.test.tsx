import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders the message when open', () => {
    render(<Toast open message="Reading saved" onDismiss={vi.fn()} />);
    expect(screen.getByText('Reading saved')).toBeInTheDocument();
  });

  it('auto-dismisses after the timeout', () => {
    const onDismiss = vi.fn();
    render(<Toast open message="Reading saved" onDismiss={onDismiss} />);
    vi.advanceTimersByTime(2200);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders nothing when closed', () => {
    const { container } = render(<Toast open={false} message="x" onDismiss={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
