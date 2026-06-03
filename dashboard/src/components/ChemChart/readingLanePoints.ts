import type { ChemistryReading, WeatherHistoryPoint } from '../../types';

/**
 * One synthetic lane point per reading, carrying that reading's day's dominant
 * weather condition (from the already mode-bucketed airHistory). Drives a
 * per-reading weather lane on the chemistry focus chart.
 *
 * Day matching uses the UTC date portion (slice 0..10) of both the reading id
 * and each weather bucket's time (both ISO-UTC). The first bucket of a day that
 * carries a condition wins. A reading whose UTC day has no condition produces no
 * point (fail-silent). `value` is unused by the lane (set to 0); the lane reads
 * only `time` (= reading id, which equals the chart's epoch x category) and the
 * condition fields.
 *
 * Caveat: matching is by UTC day, but the user sees `reading.date` (app-local
 * tz). For a late-evening-local reading that falls on the next UTC day, the icon
 * can reflect that next UTC day's weather. Acceptable for a decorative,
 * fail-silent lane; revisit with tz-aware day grouping if it ever matters.
 */
export function readingLanePoints(
  readings: ChemistryReading[],
  airHistory: WeatherHistoryPoint[],
): WeatherHistoryPoint[] {
  const byDay = new Map<string, { conditionCode: number; condition: string }>();
  for (const p of airHistory) {
    if (p.conditionCode === undefined) continue;
    const day = p.time.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { conditionCode: p.conditionCode, condition: p.condition ?? '' });
  }
  const out: WeatherHistoryPoint[] = [];
  for (const r of readings) {
    const c = byDay.get(r.id.slice(0, 10));
    if (!c) continue;
    out.push({ time: r.id, value: 0, conditionCode: c.conditionCode, condition: c.condition });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}
