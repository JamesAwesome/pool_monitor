import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSeasonSummary } from './useSeasonSummary';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('useSeasonSummary', () => {
  it('fetches the summary for the year', async () => {
    const data = { year: 2025 };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => data })) as unknown as typeof fetch);
    const { result } = renderHook(() => useSeasonSummary(2025));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toEqual(data);
    expect(fetch).toHaveBeenCalledWith('/api/season-summary?year=2025');
  });

  it('reports an error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch);
    const { result } = renderHook(() => useSeasonSummary(2025));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toBe('HTTP 500');
  });
});
