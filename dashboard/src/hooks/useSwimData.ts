import { useState, useEffect, useCallback } from 'react';
import type { SwimSession } from '../types';

export interface UseSwimDataReturn {
  swims: SwimSession[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSwimData(range: string, refreshInterval = 30000): UseSwimDataReturn {
  const [swims, setSwims] = useState<SwimSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/swims?range=${encodeURIComponent(range)}`);
      const data = res.ok ? ((await res.json()) as SwimSession[]) : [];
      setSwims(data);
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

  return { swims, loading, error, refetch: fetchData };
}
