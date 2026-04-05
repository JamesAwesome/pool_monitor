import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

describe('BottomSheet', () => {
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
});
