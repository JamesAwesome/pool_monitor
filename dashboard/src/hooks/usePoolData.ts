import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoolStats, TimeSeriesPoint, BatteryData } from '../types';

export interface UsePoolDataReturn {
  stats: PoolStats | null;
  history: TimeSeriesPoint[];
  battery: BatteryData | null;
  range: string;
  setRange: (range: string) => void;
  loading: boolean;
  error: string | null;
}

export function usePoolData(refreshInterval = 30000): UsePoolDataReturn {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [history, setHistory] = useState<TimeSeriesPoint[]>([]);
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [range, setRange] = useState('12h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedOnce = useRef(false);

  const fetchData = useCallback(async (currentRange: string) => {
    if (!hasFetchedOnce.current) {
      setLoading(true);
    }

    try {
      const [statsRes, historyRes, batteryRes] = await Promise.all([
        fetch('/api/stats'),
        fetch(`/api/history?range=${currentRange}`),
        fetch('/api/battery'),
      ]);

      if (!statsRes.ok || !historyRes.ok || !batteryRes.ok) {
        throw new Error('Failed to fetch pool data');
      }

      const [statsData, historyData, batteryData] = await Promise.all([
        statsRes.json() as Promise<PoolStats>,
        historyRes.json() as Promise<TimeSeriesPoint[]>,
        batteryRes.json() as Promise<BatteryData>,
      ]);

      setStats(statsData);
      setHistory(historyData);
      setBattery(batteryData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      hasFetchedOnce.current = true;
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when range changes
  useEffect(() => {
    fetchData(range);

    const id = setInterval(() => {
      fetchData(range);
    }, refreshInterval);

    return () => clearInterval(id);
  }, [range, refreshInterval, fetchData]);

  return { stats, history, battery, range, setRange, loading, error };
}
