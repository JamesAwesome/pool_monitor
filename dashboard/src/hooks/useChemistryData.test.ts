import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChemistryData } from './useChemistryData';

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

describe('useChemistryData', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.startsWith('/api/chemistry')) return Promise.resolve(jsonResponse([{ date: '2026-05-29T16:00:00Z', ph: 7.7 }]));
      if (url.startsWith('/api/history')) return Promise.resolve(jsonResponse([{ time: '2026-05-29T16:00:00Z', value: 28 }]));
      if (url.startsWith('/api/weather/history')) return Promise.resolve(jsonResponse([{ time: '2026-05-29T16:00:00Z', value: 30 }]));
      return Promise.resolve(jsonResponse([]));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches chemistry, pool history, and air history for the range', async () => {
    const { result } = renderHook(() => useChemistryData('season'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.readings).toEqual([{ date: '2026-05-29T16:00:00Z', ph: 7.7 }]);
    expect(result.current.poolHistory).toEqual([{ time: '2026-05-29T16:00:00Z', value: 28 }]);
    expect(result.current.airHistory).toEqual([{ time: '2026-05-29T16:00:00Z', value: 30 }]);
    expect(fetch).toHaveBeenCalledWith('/api/chemistry?range=season');
  });

  it('refetch() re-runs the fetch', async () => {
    const { result } = renderHook(() => useChemistryData('season'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await result.current.refetch();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
