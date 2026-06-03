import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoolStats, TimeSeriesPoint, WeatherHistoryPoint, SensorBattery, SensorInfo, WeatherCurrent } from '../types';

function timeSeriesChanged(prev: TimeSeriesPoint[], next: TimeSeriesPoint[]): boolean {
  if (prev.length !== next.length) return true;
  if (prev.length === 0) return false;
  return prev[0].time !== next[0].time
    || prev[prev.length - 1].time !== next[prev.length - 1].time
    || prev[0].value !== next[0].value
    || prev[prev.length - 1].value !== next[prev.length - 1].value;
}

function statsChanged(prev: PoolStats | null, next: PoolStats): boolean {
  if (!prev) return true;
  return prev.current !== next.current
    || prev.average !== next.average
    || prev.peak !== next.peak
    || prev.seasonAvg !== next.seasonAvg
    || prev.seasonPeak !== next.seasonPeak;
}

export interface UsePoolDataReturn {
  stats: PoolStats | null;
  history: TimeSeriesPoint[];
  batteries: SensorBattery[];
  range: string;
  setRange: (range: string) => void;
  loading: boolean;
  error: string | null;
  sensors: SensorInfo[];
  selectedSensor: string | null;
  setSelectedSensor: (id: string | null) => void;
  airCurrent: WeatherCurrent | null;
  airHistory: WeatherHistoryPoint[];
}

export function usePoolData(refreshInterval = 30000): UsePoolDataReturn {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [history, setHistory] = useState<TimeSeriesPoint[]>([]);
  const [batteries, setBatteries] = useState<SensorBattery[]>([]);
  const [range, setRange] = useState('3d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensors, setSensors] = useState<SensorInfo[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null);
  const [airCurrent, setAirCurrent] = useState<WeatherCurrent | null>(null);
  const [airHistory, setAirHistory] = useState<WeatherHistoryPoint[]>([]);
  const hasFetchedOnce = useRef(false);
  const statsRef = useRef<PoolStats | null>(null);
  const historyRef = useRef<TimeSeriesPoint[]>([]);

  useEffect(() => {
    fetch('/api/sensors')
      .then((res) => res.ok ? res.json() : [])
      .then((data: SensorInfo[]) => setSensors(data))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (currentRange: string, currentSensor: string | null) => {
    if (!hasFetchedOnce.current) {
      setLoading(true);
    }

    try {
      const sensorParam = currentSensor ? `&sensor=${currentSensor}` : '';
      const [statsRes, historyRes, batteryRes] = await Promise.all([
        fetch(`/api/stats?range=${currentRange}${sensorParam}`),
        fetch(`/api/history?range=${currentRange}${sensorParam}`),
        fetch(`/api/battery${currentSensor ? `?sensor=${currentSensor}` : ''}`),
      ]);

      if (!statsRes.ok || !historyRes.ok || !batteryRes.ok) {
        throw new Error('Failed to fetch pool data');
      }

      const [statsData, historyData, batteryData] = await Promise.all([
        statsRes.json() as Promise<PoolStats>,
        historyRes.json() as Promise<TimeSeriesPoint[]>,
        batteryRes.json() as Promise<SensorBattery[]>,
      ]);

      // Fetch weather data in parallel; failures must not break the rest of the dashboard
      fetch('/api/weather/current')
        .then((res) => res.ok ? res.json() as Promise<WeatherCurrent> : null)
        .then((data) => setAirCurrent(data))
        .catch(() => setAirCurrent(null));

      fetch(`/api/weather/history?range=${encodeURIComponent(currentRange)}`)
        .then((res) => res.ok ? res.json() as Promise<WeatherHistoryPoint[]> : [])
        .then((data) => setAirHistory(data ?? []))
        .catch(() => setAirHistory([]));

      if (statsChanged(statsRef.current, statsData)) {
        statsRef.current = statsData;
        setStats(statsData);
      }
      if (timeSeriesChanged(historyRef.current, historyData)) {
        historyRef.current = historyData;
        setHistory(historyData);
      }
      setBatteries(batteryData);
      setError(null);
    } catch (err) {
      // If we already have data, silently ignore transient failures
      // (e.g. network not ready after phone wake). The next interval will retry.
      if (!hasFetchedOnce.current) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      hasFetchedOnce.current = true;
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when range or sensor changes. fetchData drives loading/
  // data state asynchronously after its awaited fetches resolve — this is the
  // intended "synchronize with an external system on mount/param-change" effect,
  // not a render-time setState, so the rule's cascading-render concern doesn't apply.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(range, selectedSensor);

    const id = setInterval(() => {
      fetchData(range, selectedSensor);
    }, refreshInterval);

    // Re-fetch when tab becomes visible (e.g. phone waking from suspend)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchData(range, selectedSensor);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [range, selectedSensor, refreshInterval, fetchData]);

  return { stats, history, batteries, range, setRange, loading, error, sensors, selectedSensor, setSelectedSensor, airCurrent, airHistory };
}
