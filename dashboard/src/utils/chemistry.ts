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
