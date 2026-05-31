import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogTestFlow } from './LogTestFlow';

function renderFlow(props: Partial<React.ComponentProps<typeof LogTestFlow>> = {}) {
  const onSaved = vi.fn();
  render(
    <LogTestFlow open onClose={vi.fn()} onSaved={onSaved} latest={{ ph: 7.7 }} {...props} />,
  );
  return onSaved;
}

describe('LogTestFlow', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('shows the unlock sheet first when locked', () => {
    renderFlow();
    expect(screen.getByText(/Unlock to log a test/i)).toBeInTheDocument();
  });

  it('shows an inline error on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 } as Response)));
    renderFlow();
    await userEvent.type(screen.getByLabelText(/username/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    await waitFor(() => expect(screen.getByText(/incorrect username or password/i)).toBeInTheDocument());
  });

  it('advances to the form on success and disables Save until a value is entered', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response)));
    renderFlow();
    await userEvent.type(screen.getByLabelText(/username/i), 'alice');
    await userEvent.type(screen.getByLabelText(/password/i), 's3cret');
    await userEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    await waitFor(() => expect(screen.getByText(/Log a test/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save reading/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^FC/i), '4.0');
    expect(screen.getByRole('button', { name: /save reading/i })).toBeEnabled();
  });
});
