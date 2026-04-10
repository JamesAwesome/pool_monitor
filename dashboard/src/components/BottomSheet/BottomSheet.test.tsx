import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, beforeEach, afterEach } from 'vitest';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
  // Mock requestAnimationFrame so scroll restoration fires synchronously in tests
  let rafSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => {
    rafSpy.mockRestore();
  });
  it('renders nothing when closed', () => {
    render(<BottomSheet open={false} onClose={vi.fn()} title="Test">Content</BottomSheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders content when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()} title="Test">Hello</BottomSheet>);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Test')).toBeTruthy();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BottomSheet open={true} onClose={onClose} title="Test">Content</BottomSheet>);
    await user.click(screen.getByTestId('bottom-sheet-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when sheet content is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BottomSheet open={true} onClose={onClose} title="Test">Content</BottomSheet>);
    await user.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BottomSheet open={true} onClose={onClose} title="Test">Content</BottomSheet>);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BottomSheet open={true} onClose={onClose} title="Test">Content</BottomSheet>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()} title="Test">Content</BottomSheet>);
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.left).toBe('0px');
    expect(document.body.style.right).toBe('0px');
    expect(document.body.style.width).toBe('100%');
  });

  it('restores body styles when closed after being open', () => {
    const { rerender } = render(
      <BottomSheet open={true} onClose={vi.fn()} title="Test">Content</BottomSheet>
    );
    expect(document.body.style.position).toBe('fixed');

    rerender(<BottomSheet open={false} onClose={vi.fn()} title="Test">Content</BottomSheet>);

    expect(document.body.style.position).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.left).toBe('');
    expect(document.body.style.right).toBe('');
    expect(document.body.style.width).toBe('');
  });

  it('preserves scroll position through open/close cycle', () => {
    Object.defineProperty(window, 'scrollY', { value: 150, writable: true });
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;

    const { rerender } = render(
      <BottomSheet open={true} onClose={vi.fn()} title="Test">Content</BottomSheet>
    );
    expect(document.body.style.top).toBe('-150px');

    rerender(<BottomSheet open={false} onClose={vi.fn()} title="Test">Content</BottomSheet>);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 150);

    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });
});
