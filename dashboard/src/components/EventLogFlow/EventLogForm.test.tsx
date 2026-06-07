import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventLogForm } from './EventLogForm';
import type { PoolEvent } from '../../types';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ id: 'x' }) })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const noop = () => {};

const CHEM_EDIT: PoolEvent = {
  id: '2026-05-20T18:30:00.000Z',
  date: '2026-05-20',
  time: '14:30',
  kind: 'chemical',
  items: [{ product: 'Cal-hypo', amount: 12, unit: 'oz' }],
};

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

  it('chemical POSTs product, numeric amount, unit + Authorization header', async () => {
    render(<EventLogForm kind="chemical" authHeader="Basic dGVzdDp0ZXN0" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    // Pick a preset product chip, then enter an amount.
    fireEvent.click(screen.getByRole('button', { name: 'Cal-hypo' }));
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '12' } });

    const log = screen.getByRole('button', { name: /log it/i });
    await waitFor(() => expect(log).not.toBeDisabled());
    fireEvent.click(log);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' })));
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.kind).toBe('chemical');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].product).toBe('Cal-hypo');
    expect(typeof body.items[0].amount).toBe('number');
    expect(body.items[0].amount).toBe(12);
    expect(['oz', 'lb', 'gal', 'tabs']).toContain(body.items[0].unit);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Basic dGVzdDp0ZXN0');
  });

  describe('edit mode', () => {
    it('pre-fills product, amount, date, and time from a chemical editEntry', () => {
      render(<EventLogForm kind="chemical" authHeader="Basic x" editEntry={CHEM_EDIT} onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
      expect(screen.getByDisplayValue('2026-05-20')).toBeInTheDocument();
      expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();
      expect(screen.getByDisplayValue('12')).toBeInTheDocument();
      // The pre-selected product chip is active.
      expect(screen.getByRole('button', { name: 'Cal-hypo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /log it/i })).not.toBeInTheDocument();
    });

    it('PUTs to /api/events with the id in the body', async () => {
      const onSaved = vi.fn();
      render(<EventLogForm kind="chemical" authHeader="Basic dGVzdDp0ZXN0" editEntry={CHEM_EDIT} onSaved={onSaved} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);

      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/events');
      expect(init.method).toBe('PUT');
      const body = JSON.parse(init.body as string);
      expect(body.id).toBe(CHEM_EDIT.id);
      expect(body.kind).toBe('chemical');
      expect(body.items[0].product).toBe('Cal-hypo');
      expect(body.items[0].amount).toBe(12);
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Basic dGVzdDp0ZXN0');
    });
  });

  describe('delete flow', () => {
    it('DELETEs the encoded id and fires onDeleted', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch);
      const onDeleted = vi.fn();
      const onSaved = vi.fn();
      render(<EventLogForm kind="chemical" authHeader="Basic x" editEntry={CHEM_EDIT} onSaved={onSaved} onClose={noop} onAuthExpired={noop} onDeleted={onDeleted} />);

      fireEvent.click(screen.getByRole('button', { name: /delete this entry/i }));
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

      await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());

      const fetchMock = vi.mocked(fetch);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`/api/events?id=${encodeURIComponent(CHEM_EDIT.id)}`);
      expect(init.method).toBe('DELETE');
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  describe('401 handling', () => {
    it('calls onAuthExpired and NOT onSaved when save returns 401', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })) as unknown as typeof fetch);
      const onSaved = vi.fn();
      const onAuthExpired = vi.fn();
      render(<EventLogForm kind="backwash" authHeader="Basic x" onSaved={onSaved} onClose={noop} onAuthExpired={onAuthExpired} onDeleted={noop} />);

      fireEvent.click(screen.getByRole('button', { name: /log it/i }));

      await waitFor(() => expect(onAuthExpired).toHaveBeenCalledOnce());
      expect(onSaved).not.toHaveBeenCalled();
    });
  });

  it('logs multiple chemicals at one timestamp', async () => {
    render(<EventLogForm kind="chemical" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    // Row 1
    fireEvent.click(screen.getByRole('button', { name: 'Liquid chlorine' }));
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '48' } });
    // Add a second row
    fireEvent.click(screen.getByRole('button', { name: /add another chemical/i }));
    // Two rows exist now — click the second row's Muriatic acid chip (last match)
    const muriatic = screen.getAllByRole('button', { name: 'Muriatic acid' });
    fireEvent.click(muriatic[muriatic.length - 1]);
    fireEvent.change(screen.getAllByPlaceholderText('0')[1], { target: { value: '16' } });

    const log = screen.getByRole('button', { name: /log it/i });
    await waitFor(() => expect(log).not.toBeDisabled());
    fireEvent.click(log);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.kind).toBe('chemical');
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ product: 'Liquid chlorine', amount: 48 });
    expect(body.items[1]).toMatchObject({ product: 'Muriatic acid', amount: 16 });
  });

  it('removes an added chemical row', async () => {
    render(<EventLogForm kind="chemical" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Liquid chlorine' }));
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '48' } });
    fireEvent.click(screen.getByRole('button', { name: /add another chemical/i }));
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /remove chemical 2/i }));
    expect(screen.getAllByPlaceholderText('0')).toHaveLength(1);
  });

  it('reconstructs a row from a legacy product-only event in edit mode', async () => {
    const legacy: PoolEvent = { id: '2026-05-20T18:30:00.000Z', date: '2026-05-20', time: '14:30', kind: 'chemical', product: 'Some custom acid', amount: 9, unit: 'oz' };
    render(<EventLogForm kind="chemical" authHeader="Basic x" editEntry={legacy} onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    // An off-preset legacy product reconstructs into the "Other" free-text field.
    expect(screen.getByDisplayValue('Some custom acid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/events');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string);
    expect(body.items).toEqual([{ product: 'Some custom acid', amount: 9, unit: 'oz' }]);
  });

  it('keeps Log it disabled until every chemical row has a product + positive amount', () => {
    render(<EventLogForm kind="chemical" authHeader="Basic x" onSaved={noop} onClose={noop} onAuthExpired={noop} onDeleted={noop} />);
    const logBtn = () => screen.getByRole('button', { name: /log it/i });
    expect(logBtn()).toBeDisabled();                                  // no product, no amount
    fireEvent.click(screen.getByRole('button', { name: 'Liquid chlorine' }));
    expect(logBtn()).toBeDisabled();                                  // product but blank amount
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '0' } });
    expect(logBtn()).toBeDisabled();                                  // zero amount
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '48' } });
    expect(logBtn()).not.toBeDisabled();                             // valid
    fireEvent.click(screen.getByRole('button', { name: /add another chemical/i }));
    expect(logBtn()).toBeDisabled();                                 // empty second row re-disables
  });
});
