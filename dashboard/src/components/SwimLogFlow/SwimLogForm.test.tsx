import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SwimLogForm } from './SwimLogForm';

const EDIT_ENTRY = {
  id: '2026-05-20T18:30:00.000Z',
  date: '2026-05-20',
  time: '14:30',
  people: ['🦦'],
};

const defaultProps = {
  open: true as const,
  authHeader: 'Basic dGVzdDp0ZXN0',
  swims: [] as never[],
  onSaved: vi.fn(),
  onDeleted: vi.fn(),
  onClose: vi.fn(),
  onAuthExpired: vi.fn(),
};

function renderForm(props: Partial<typeof defaultProps & { editEntry: typeof EDIT_ENTRY }> = {}) {
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  const onClose = vi.fn();
  const onAuthExpired = vi.fn();
  render(
    <SwimLogForm
      {...defaultProps}
      onSaved={onSaved}
      onDeleted={onDeleted}
      onClose={onClose}
      onAuthExpired={onAuthExpired}
      {...props}
    />,
  );
  return { onSaved, onDeleted, onClose, onAuthExpired };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: 'x' }) })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const noop = () => {};

describe('SwimLogForm', () => {
  it('disables Log swim until at least one person is picked', () => {
    render(<SwimLogForm open authHeader="Basic x" swims={[]} onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    expect(screen.getByRole('button', { name: /log swim/i })).toBeDisabled();
  });

  it('enables and POSTs after picking a swimmer', async () => {
    render(<SwimLogForm open authHeader="Basic x" swims={[]} onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    fireEvent.click(screen.getAllByTestId('swim-tile')[0]);
    const log = screen.getByRole('button', { name: /log swim/i });
    await waitFor(() => expect(log).not.toBeDisabled());
    fireEvent.click(log);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/swims', expect.objectContaining({ method: 'POST' })));
  });

  describe('edit mode', () => {
    it('pre-fills date and time inputs from editEntry', () => {
      renderForm({ editEntry: EDIT_ENTRY });
      expect(screen.getByDisplayValue('2026-05-20')).toBeInTheDocument();
      expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();
    });

    it('shows the picked count for the pre-populated swimmer', () => {
      renderForm({ editEntry: EDIT_ENTRY });
      expect(screen.getByText(/1 swimmer/)).toBeInTheDocument();
    });

    it('shows "Save changes" button instead of "Log swim"', () => {
      renderForm({ editEntry: EDIT_ENTRY });
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /log swim/i })).not.toBeInTheDocument();
    });

    it('PUTs with the correct URL, method, and body including the id', async () => {
      const { onSaved } = renderForm({ editEntry: EDIT_ENTRY });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/swims');
      expect(init.method).toBe('PUT');
      const body = JSON.parse(init.body as string);
      expect(body.id).toBe(EDIT_ENTRY.id);
      expect(body.date).toBe(EDIT_ENTRY.date);
      expect(body.time).toBe(EDIT_ENTRY.time);
      expect(body.people).toEqual(EDIT_ENTRY.people);
    });

    it('sends the Authorization header on PUT', async () => {
      const { onSaved } = renderForm({ editEntry: EDIT_ENTRY });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());

      const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Basic dGVzdDp0ZXN0');
    });
  });

  describe('delete flow', () => {
    it('shows "Delete this swim" link in edit mode', () => {
      renderForm({ editEntry: EDIT_ENTRY });
      expect(screen.getByRole('button', { name: /delete this swim/i })).toBeInTheDocument();
    });

    it('does not show "Delete this swim" in new-entry mode', () => {
      renderForm();
      expect(screen.queryByRole('button', { name: /delete this swim/i })).not.toBeInTheDocument();
    });

    it('shows inline confirm after clicking "Delete this swim"', () => {
      renderForm({ editEntry: EDIT_ENTRY });
      fireEvent.click(screen.getByRole('button', { name: /delete this swim/i }));
      expect(screen.getByText(/Delete this swim permanently\?/)).toBeInTheDocument();
    });

    it('calls DELETE with the encoded id and fires onDeleted', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch);
      const { onDeleted, onSaved } = renderForm({ editEntry: EDIT_ENTRY });

      fireEvent.click(screen.getByRole('button', { name: /delete this swim/i }));
      // Click the confirming "Delete" button inside the confirm panel
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

      await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`/api/swims?id=${encodeURIComponent(EDIT_ENTRY.id)}`);
      expect(init.method).toBe('DELETE');
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('"Keep" cancels the confirm panel', () => {
      renderForm({ editEntry: EDIT_ENTRY });
      fireEvent.click(screen.getByRole('button', { name: /delete this swim/i }));
      fireEvent.click(screen.getByRole('button', { name: /keep/i }));
      expect(screen.queryByText(/Delete this swim permanently\?/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete this swim/i })).toBeInTheDocument();
    });
  });

  describe('401 handling', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch);
    });

    it('calls onAuthExpired and NOT onSaved when save returns 401', async () => {
      const { onSaved, onAuthExpired } = renderForm({ editEntry: EDIT_ENTRY });

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(onAuthExpired).toHaveBeenCalledOnce());
      expect(onSaved).not.toHaveBeenCalled();
    });

    it('calls onAuthExpired and NOT onDeleted when delete returns 401', async () => {
      const { onDeleted, onAuthExpired } = renderForm({ editEntry: EDIT_ENTRY });

      fireEvent.click(screen.getByRole('button', { name: /delete this swim/i }));
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

      await waitFor(() => expect(onAuthExpired).toHaveBeenCalledOnce());
      expect(onDeleted).not.toHaveBeenCalled();
    });
  });

  describe('emoji keyboard', () => {
    it('opens the keyboard sheet when the ＋ tile is clicked', async () => {
      renderForm();
      fireEvent.click(screen.getByRole('button', { name: /open emoji keyboard/i }));
      await waitFor(() => expect(screen.getByRole('dialog', { name: /pick any emoji/i })).toBeInTheDocument());
    });
  });
});
