import { vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePoolData } from './usePoolData';

const mockStats = {
  current: 25.5,
  average: 24.0,
  peak: 27.2,
  seasonAvg: 23.5,
  seasonPeak: 29.0,
};

const mockHistory = [
  { time: '2026-04-04T10:00:00Z', value: 24.5 },
  { time: '2026-04-04T11:00:00Z', value: 25.0 },
];

const mockBattery = {
  current: 3.7,
  history: [
    { time: '2026-04-04T10:00:00Z', value: 3.8 },
    { time: '2026-04-04T11:00:00Z', value: 3.7 },
  ],
};

function mockFetchSuccess() {
  globalThis.fetch = vi.fn((url: string | URL | Request) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/stats'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) });
    if (urlStr.includes('/api/history'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHistory) });
    if (urlStr.includes('/api/battery'))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBattery) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }) as unknown as typeof fetch;
}

describe('usePoolData', () => {
  beforeEach(() => {
    mockFetchSuccess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => usePoolData(60000));
    expect(result.current.loading).toBe(true);
    expect(result.current.stats).toBeNull();
    expect(result.current.history).toEqual([]);
    expect(result.current.battery).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('fetches and populates all data', async () => {
    const { result } = renderHook(() => usePoolData(60000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.stats).toEqual(mockStats);
    expect(result.current.history).toEqual(mockHistory);
    expect(result.current.battery).toEqual(mockBattery);
    expect(result.current.error).toBeNull();
  });

  it('defaults range to 12h', () => {
    const { result } = renderHook(() => usePoolData(60000));
    expect(result.current.range).toBe('12h');
  });

  it('fetches with correct range parameter', async () => {
    renderHook(() => usePoolData(60000));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/history?range=12h');
    });
  });

  it('sets error state on fetch failure', async () => {
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/stats'))
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      if (urlStr.includes('/api/history'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockHistory) });
      if (urlStr.includes('/api/battery'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBattery) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => usePoolData(60000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to fetch pool data');
  });

  it('sets error on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    const { result } = renderHook(() => usePoolData(60000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
  });

  it('keeps stale data on error after successful fetch', async () => {
    const { result } = renderHook(() => usePoolData(600000));

    await waitFor(() => {
      expect(result.current.stats).toEqual(mockStats);
    });

    // Now make fetch fail for the next call
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    // Change range to trigger a re-fetch (instead of waiting for interval)
    act(() => {
      result.current.setRange('24h');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });

    // Stale data should remain
    expect(result.current.stats).toEqual(mockStats);
    expect(result.current.history).toEqual(mockHistory);
  });

  it('re-fetches when range changes', async () => {
    const { result } = renderHook(() => usePoolData(600000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    (fetch as ReturnType<typeof vi.fn>).mockClear();

    act(() => {
      result.current.setRange('24h');
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/history?range=24h');
    });
  });

  it('clears interval on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { result, unmount } = renderHook(() => usePoolData(60000));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('refreshes data on interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetchSuccess();

    const { result } = renderHook(() => usePoolData(30000));

    // Wait for initial fetch to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const callCountAfterInit = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Advance past the interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    // Should have made 3 more calls (stats, history, battery)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountAfterInit + 3);

    vi.useRealTimers();
  });
});
