import { celsiusToFahrenheit } from '../../utils/temperature';
import type { ChemistryReading, ChemKey, TimeSeriesPoint } from '../../types';

export interface ChartPoint {
  t: number;        // epoch ms (numeric x for a shared time domain)
  chem?: number;
  pool?: number;
  air?: number;
}

export function buildChartData(
  readings: ChemistryReading[],
  chemKey: ChemKey,
  poolHistory: TimeSeriesPoint[],
  airHistory: TimeSeriesPoint[],
  showPool: boolean,
  showAir: boolean,
  isFahrenheit: boolean,
): ChartPoint[] {
  const byTime = new Map<number, ChartPoint>();
  const get = (iso: string) => {
    const t = new Date(iso).getTime();
    let p = byTime.get(t);
    if (!p) { p = { t }; byTime.set(t, p); }
    return p;
  };
  for (const r of readings) {
    const v = r[chemKey];
    if (typeof v === 'number') get(r.id).chem = v;
  }
  if (showPool) for (const p of poolHistory) get(p.time).pool = isFahrenheit ? celsiusToFahrenheit(p.value) : p.value;
  if (showAir) for (const p of airHistory) get(p.time).air = isFahrenheit ? celsiusToFahrenheit(p.value) : p.value;
  return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
}
