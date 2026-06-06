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

/**
 * Extend the pool/air overlay curves to the chart's right edge.
 *
 * Temperature history is aggregated into buckets stamped at the window start
 * (1-day windows on the Season/All ranges → today's bucket is stamped at UTC
 * midnight). The chart's x-domain, however, reaches the latest chem reading or
 * marker (often many hours later), so the temp curves stop short of the edge.
 * This appends one point at `edgeT` carrying the live current temp (caller
 * resolves current-or-last, already in display units), closing that gap.
 *
 * No-op when there's nothing to add, when the edge isn't a real time, or when
 * the temp series already reaches the edge. Pure + exported for testing.
 */
export function extendTempToEdge(
  data: ChartPoint[],
  edgeT: number | null,
  values: { poolValue: number | null; airValue: number | null },
): ChartPoint[] {
  if (edgeT == null) return data;
  let lastTempT = -Infinity;
  for (const p of data) if (p.pool != null || p.air != null) lastTempT = p.t;
  if (edgeT <= lastTempT) return data; // already reaches the edge — no gap

  const extra: ChartPoint = { t: edgeT };
  if (values.poolValue != null) extra.pool = values.poolValue;
  if (values.airValue != null) extra.air = values.airValue;
  if (extra.pool == null && extra.air == null) return data;

  const existing = data.find((p) => p.t === edgeT);
  if (existing) return data.map((p) => (p.t === edgeT ? { ...p, ...extra } : p));
  return [...data, extra].sort((a, b) => a.t - b.t);
}
