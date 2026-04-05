export interface PoolStats {
  current: number;
  average: number;
  peak: number;
  seasonAvg: number;
  seasonPeak: number;
}

export interface TimeSeriesPoint {
  time: string;
  value: number;
}

export interface BatteryData {
  current: number;
  history: TimeSeriesPoint[];
}

export interface SensorBattery {
  id: string;
  model: string;
  current: number | null;
}

export interface SensorInfo {
  id: string;
  model: string;
}

export interface SeasonYear {
  year: number;
  average: number | null;
  peak: number | null;
}

export type TemperatureUnit = 'C' | 'F';
export type Theme = 'light' | 'dark';
export type TemperatureZone = 'hot' | 'warm' | 'normal' | 'cool';
