import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoolStats, TimeSeriesPoint, SensorBattery, SensorInfo } from '../types';

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
  const hasFetchedOnce = useRef(false);

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
        fetch(`/api/stats${currentSensor ? `?sensor=${currentSensor}` : ''}`),
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

      setStats(statsData);
      setHistory(historyData);
      setBatteries(batteryData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      hasFetchedOnce.current = true;
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when range or sensor changes
  useEffect(() => {
    fetchData(range, selectedSensor);

    const id = setInterval(() => {
      fetchData(range, selectedSensor);
    }, refreshInterval);

    return () => clearInterval(id);
  }, [range, selectedSensor, refreshInterval, fetchData]);

  return { stats, history, batteries, range, setRange, loading, error, sensors, selectedSensor, setSelectedSensor };
}
