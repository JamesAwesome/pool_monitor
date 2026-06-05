import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useEventData } from './useEventData';

const events = [{ id: '1', date: '2026-05-20', time: '14:30', kind: 'backwash' }];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => events })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useEventData', () => {
  it('fetches events for the range', async () => {
    const { result } = renderHook(() => useEventData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual(events);
    expect(fetch).toHaveBeenCalledWith('/api/events?range=season');
  });
  it('returns [] on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })) as unknown as typeof fetch);
    const { result } = renderHook(() => useEventData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
  });
});
