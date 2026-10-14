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

  it('stays null when the request fails', async () => {
    const f = vi.fn(async () => { throw new Error('down'); });
    vi.stubGlobal('fetch', f as unknown as typeof fetch);
    const { result } = renderHook(() => useMode());
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
