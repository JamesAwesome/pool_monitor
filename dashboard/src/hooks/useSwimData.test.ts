import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSwimData } from './useSwimData';

const swims = [{ id: '1', date: '2026-05-20', time: '14:30', people: ['🦦'] }];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => swims })) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useSwimData', () => {
  it('fetches swims for the range and exposes them', async () => {
    const { result } = renderHook(() => useSwimData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.swims).toEqual(swims);
    expect(fetch).toHaveBeenCalledWith('/api/swims?range=season');
  });

  it('returns an empty list when the request is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => [] })) as unknown as typeof fetch);
    const { result } = renderHook(() => useSwimData('season', 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.swims).toEqual([]);
  });
});
