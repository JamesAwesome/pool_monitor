import { useState, useEffect, useCallback } from 'react';
import type { ChemistryReading, TimeSeriesPoint } from '../types';

export interface UseChemistryDataReturn {
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChemistryData(range: string, refreshInterval = 30000): UseChemistryDataReturn {
  const [readings, setReadings] = useState<ChemistryReading[]>([]);
  const [poolHistory, setPoolHistory] = useState<TimeSeriesPoint[]>([]);
  const [airHistory, setAirHistory] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [chemRes, poolRes, airRes] = await Promise.all([
        fetch(`/api/chemistry?range=${encodeURIComponent(range)}`),
        fetch(`/api/history?range=${encodeURIComponent(range)}`),
        fetch(`/api/weather/history?range=${encodeURIComponent(range)}`),
      ]);
      const [chem, pool, air] = await Promise.all([
        chemRes.ok ? (chemRes.json() as Promise<ChemistryReading[]>) : [],
        poolRes.ok ? (poolRes.json() as Promise<TimeSeriesPoint[]>) : [],
        airRes.ok ? (airRes.json() as Promise<TimeSeriesPoint[]>) : [],
      ]);
      setReadings(chem);
      setPoolHistory(pool);
      setAirHistory(air);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  return { readings, poolHistory, airHistory, loading, error, refetch: fetchData };
}
