import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogTestFlow } from './LogTestFlow';
import type { ChemistryReading } from '../../types';

const AUTH_KEY = 'pool-dashboard-chem-auth';

function seedUnlocked() {
  localStorage.setItem(AUTH_KEY, btoa('alice:s3cret'));
}

function renderFlow(props: Partial<React.ComponentProps<typeof LogTestFlow>> = {}) {
  const onSaved = vi.fn();
  render(
    <LogTestFlow open onClose={vi.fn()} onSaved={onSaved} onDeleted={vi.fn()} latest={{ ph: 7.7 }} readings={[]} {...props} />,
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

  it('edit mode pre-fills and PUTs to /api/chemistry', async () => {
    seedUnlocked();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'x' }) } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const editEntry: ChemistryReading = { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6 };
    renderFlow({ editEntry, readings: [editEntry] });
    // form shows Edit test header + Save changes button
    expect(await screen.findByText(/Edit test/i)).toBeInTheDocument();
    // Save changes is enabled because fc is pre-filled
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeEnabled();
    await userEvent.click(saveBtn);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/chemistry',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('delete confirm flow DELETEs by id', async () => {
    seedUnlocked();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) } as Response));
    vi.stubGlobal('fetch', fetchMock);
    const editEntry: ChemistryReading = { id: '2026-05-20T11:50:00Z', date: '2026-05-20', time: '07:50', fc: 3.6 };
    renderFlow({ editEntry, readings: [editEntry] });
    await userEvent.click(await screen.findByRole('button', { name: /delete this entry/i }));
    // confirm step — two-tap: first click shows confirm, second click (Delete) fires DELETE
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) => ((c as unknown as [string, RequestInit])[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(((call as unknown as [string, RequestInit]) ?? [])[0]).toContain('/api/chemistry?id=');
    });
  });
});
