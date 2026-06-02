import type { ChemKey, ChemistryReading } from '../types';

function valuesFor(readings: ChemistryReading[], key: ChemKey): number[] {
  return readings
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number');
}

export function latestReading(readings: ChemistryReading[], key: ChemKey): number | null {
  const vals = valuesFor(readings, key);
  return vals.length ? vals[vals.length - 1] : null;
}

export interface Delta {
  dir: 'up' | 'down' | 'flat';
  magnitude: number;
}

export function computeDelta(readings: ChemistryReading[], key: ChemKey, decimals: number): Delta | null {
  const vals = valuesFor(readings, key);
  if (vals.length < 2) return null;
  const diff = vals[vals.length - 1] - vals[vals.length - 2];
  const magnitude = parseFloat(Math.abs(diff).toFixed(decimals + 1));
  const threshold = 0.5 * Math.pow(10, -decimals); // half a display unit
  if (magnitude < threshold) return { dir: 'flat', magnitude: 0 };
  return { dir: diff > 0 ? 'up' : 'down', magnitude: parseFloat(Math.abs(diff).toFixed(decimals)) };
}

export interface ChemStats {
  low: number;
  avg: number;
  high: number;
  count: number;
}

export function computeStats(readings: ChemistryReading[], key: ChemKey): ChemStats | null {
  const vals = valuesFor(readings, key);
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return {
    low: Math.min(...vals),
    avg: sum / vals.length,
    high: Math.max(...vals),
    count: vals.length,
  };
}

export function formatChemValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function testsOnDay(readings: ChemistryReading[], date: string): number {
  return readings.filter((r) => r.date === date).length;
}

export function sortedDesc(readings: ChemistryReading[]): ChemistryReading[] {
  return [...readings].sort((a, b) => b.id.localeCompare(a.id));
}

export function fmtTime12(time: string): string {
  const [h, m] = time.split(':').map((s) => parseInt(s, 10));
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function fmtDateWeekday(date: string): string {
  // Parse as local midnight to avoid tz shifting the weekday.
  const [y, mo, d] = date.split('-').map((s) => parseInt(s, 10));
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
