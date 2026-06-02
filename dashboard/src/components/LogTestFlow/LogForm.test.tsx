import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogForm } from './LogForm';

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  authHeader: 'Basic dGVzdDp0ZXN0',
  latest: { fc: 4 },
  onSaved: vi.fn(),
  onAuthExpired: vi.fn(),
  readings: [],
  onDeleted: vi.fn(),
};

function renderForm(props: Partial<React.ComponentProps<typeof LogForm>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onAuthExpired = vi.fn();
  render(
    <LogForm
      {...defaultProps}
      onClose={onClose}
      onSaved={onSaved}
      onAuthExpired={onAuthExpired}
      {...props}
    />,
  );
  return { onClose, onSaved, onAuthExpired };
}

describe('LogForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('date input', () => {
    it('defaults to today in YYYY-MM-DD format', () => {
      renderForm();
      const d = new Date();
      const expected = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
      const dateInput = screen.getByDisplayValue(expected);
      expect(dateInput).toBeInTheDocument();
    });
  });

  describe('successful save', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ ok: true }),
          } as Response),
        ),
      );
    });

    it('calls fetch with correct URL, method, Authorization header, and body', async () => {
      const { onSaved } = renderForm();
      await userEvent.type(screen.getByLabelText('FC'), '4.5');
      await userEvent.click(screen.getByRole('button', { name: /save reading/i }));

      await waitFor(() => expect(onSaved).toHaveBeenCalled());

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/chemistry');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Basic dGVzdDp0ZXN0');

      const body = JSON.parse(init.body as string);
      expect(body.fc).toBe(4.5);
      expect(typeof body.date).toBe('string');
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('calls onSaved after a successful POST', async () => {
      const { onSaved, onAuthExpired } = renderForm();
      await userEvent.type(screen.getByLabelText('FC'), '3');
      await userEvent.click(screen.getByRole('button', { name: /save reading/i }));

      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
      expect(onAuthExpired).not.toHaveBeenCalled();
    });
  });

  describe('401 response', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 401,
          } as Response),
        ),
      );
    });

    it('calls onAuthExpired and NOT onSaved when fetch returns 401', async () => {
      const { onSaved, onAuthExpired } = renderForm();
      await userEvent.type(screen.getByLabelText('FC'), '5');
      await userEvent.click(screen.getByRole('button', { name: /save reading/i }));

      await waitFor(() => expect(onAuthExpired).toHaveBeenCalledOnce());
      expect(onSaved).not.toHaveBeenCalled();
    });
  });
});
