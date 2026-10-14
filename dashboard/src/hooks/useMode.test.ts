import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMode } from './useMode';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useMode', () => {
  it('returns the server mode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ offSeason: true, latestYear: 2025 }) })) as unknown as typeof fetch);
    const { result } = renderHook(() => useMode());
    await waitFor(() => expect(result.current).toEqual({ offSeason: true, latestYear: 2025 }));
  });

  it('is null until the request settles', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})) as unknown as typeof fetch);
    const { result } = renderHook(() => useMode());
    expect(result.current).toBeNull();
  });

  it('settles as in-season when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }) as unknown as typeof fetch);
    const { result } = renderHook(() => useMode());
    await waitFor(() => expect(result.current).toEqual({ offSeason: false, latestYear: null }));
  });

  it('settles as in-season on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch);
    const { result } = renderHook(() => useMode());
    await waitFor(() => expect(result.current).toEqual({ offSeason: false, latestYear: null }));
  });
});
