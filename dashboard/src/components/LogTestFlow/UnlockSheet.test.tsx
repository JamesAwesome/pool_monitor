import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnlockSheet } from './UnlockSheet';

describe('UnlockSheet', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes the typed username to lowercase in the sent credential', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onUnlocked = vi.fn();

    render(<UnlockSheet open onClose={vi.fn()} onUnlocked={onUnlocked} />);

    await userEvent.type(screen.getByLabelText(/username/i), 'ALICE');
    await userEvent.type(screen.getByLabelText(/password/i), 'S3cret');
    await userEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    await waitFor(() => expect(onUnlocked).toHaveBeenCalledOnce());

    // The probe request carries the lowercased username but the original password.
    const header = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(header).toBeDefined();
    const decoded = atob(header.Authorization.slice('Basic '.length));
    expect(decoded).toBe('alice:S3cret');
  });
});
