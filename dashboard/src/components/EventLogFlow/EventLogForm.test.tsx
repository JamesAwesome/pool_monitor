import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventLogForm } from './EventLogForm';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'x' }) })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const noop = () => {};

describe('EventLogForm', () => {
  it('backwash needs no payload — Log it is enabled and POSTs kind=backwash', async () => {
    render(<EventLogForm kind="backwash" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    const btn = screen.getByRole('button', { name: /log it/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls.at(-1)![1].body);
    expect(body.kind).toBe('backwash');
  });
  it('note Log it is disabled until text entered', () => {
    render(<EventLogForm kind="note" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    expect(screen.getByRole('button', { name: /log it/i })).toBeDisabled();
  });
  it('water posts amount + unit', async () => {
    render(<EventLogForm kind="water" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /log it/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls.at(-1)![1].body);
    expect(body).toMatchObject({ kind: 'water', amount: 2 });
    expect(['in', 'gal', 'min']).toContain(body.unit);
  });
});
