export interface PoolStats {
  current: number | null;
  average: number | null;
  peak: number | null;
  seasonAvg: number | null;
  seasonPeak: number | null;
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

export interface StatDetailPeriod {
  start: string;
  stop: string;
  average?: number | null;
  high?: number | null;
  low?: number | null;
}

export interface SeasonYear {
  year: number;
  average: number | null;
  peak: number | null;
  low: number | null;
}

export type TemperatureUnit = 'C' | 'F';
export type Theme = 'light' | 'dark';
export type TemperatureZone = 'hot' | 'warm' | 'normal' | 'cool';

export interface WeatherCurrent {
  temperature_C: number;
  feelslike_C: number;
  humidity: number;
  condition: string;
  location: string;
  timestamp: string;
}

export type ChemKey = 'ph' | 'fc' | 'cc' | 'ta' | 'cya' | 'ch';

export interface ChemistryReading {
  id: string;   // ISO UTC timestamp (stable id)
  date: string; // YYYY-MM-DD in app timezone
  time: string; // HH:mm 24h in app timezone
  ph?: number; fc?: number; cc?: number; ta?: number; cya?: number; ch?: number;
}
