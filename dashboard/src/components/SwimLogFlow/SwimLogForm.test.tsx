import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SwimLogForm } from './SwimLogForm';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'x' }) })) as unknown as typeof fetch);
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
});
