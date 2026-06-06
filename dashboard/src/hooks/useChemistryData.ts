import { useState, useEffect, useCallback } from 'react';
import type { ChemistryReading, TimeSeriesPoint } from '../types';

export interface UseChemistryDataReturn {
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  /** Live current pool/air temps (°C). The history arrays are bucket-aggregated,
   *  so their last point lags "now"; these drive the focus-sheet "now" legend. */
  poolCurrent: number | null;
  airCurrent: number | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useChemistryData(range: string, refreshInterval = 30000): UseChemistryDataReturn {
  const [readings, setReadings] = useState<ChemistryReading[]>([]);
  const [poolHistory, setPoolHistory] = useState<TimeSeriesPoint[]>([]);
  const [airHistory, setAirHistory] = useState<TimeSeriesPoint[]>([]);
  const [poolCurrent, setPoolCurrent] = useState<number | null>(null);
  const [airCurrent, setAirCurrent] = useState<number | null>(null);
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

    // Live current temps for the "now" legend — fetched independently and
    // fail-silent so a weather/stats hiccup never blanks the chem trends.
    fetch(`/api/stats?range=${encodeURIComponent(range)}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ current: number | null }>) : null))
      .then((d) => setPoolCurrent(d?.current ?? null))
      .catch(() => setPoolCurrent(null));
    fetch('/api/weather/current')
      .then((res) => (res.ok ? (res.json() as Promise<{ temperature_C: number | null }>) : null))
      .then((d) => setAirCurrent(d?.temperature_C ?? null))
      .catch(() => setAirCurrent(null));
  }, [range]);

  useEffect(() => {
    // Intentionally show the loading state when the range (→ fetchData) changes.
    // This is a deliberate synchronize-on-param-change effect, not a render-time
    // setState; the rule's cascading-render concern doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [fetchData, refreshInterval]);

  return { readings, poolHistory, airHistory, poolCurrent, airCurrent, loading, error, refetch: fetchData };
}
