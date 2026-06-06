import { useState, useEffect, useCallback } from 'react';
import type { PoolEvent } from '../types';

export interface UseEventDataReturn {
  events: PoolEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useEventData(range: string, refreshInterval = 30000): UseEventDataReturn {
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?range=${encodeURIComponent(range)}`);
      const data = res.ok ? ((await res.json()) as PoolEvent[]) : [];
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchData();
    if (!refreshInterval) return;
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  return { events, loading, error, refetch: fetchData };
}
