import { useXAxisScale, usePlotArea } from 'recharts';
import type { WeatherHistoryPoint } from '../../types';
import { conditionToIcon, ConditionGlyph, type ConditionKind } from './conditionIcon';

const MIN_ICON_GAP = 24; // px — minimum horizontal spacing so icons never collide

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * The lane rollup floor for a range: conditions are coarsened to this window
 * (dominant per window) before identical runs are collapsed, so brief 5-minute
 * flicker doesn't spawn spurious icons. Tuned so a stable day shows ~1 icon and
 * a typical day shows a handful.
 */
export function rollupMsForRange(range: string): number {
  if (range.startsWith('custom:')) {
    const [, from, to] = range.split(':');
    const days = (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS + 1;
    if (days <= 1) return HOUR_MS;
    if (days <= 3) return 3 * HOUR_MS;
    if (days <= 7) return 6 * HOUR_MS;
    if (days <= 30) return DAY_MS;
    return 2 * DAY_MS;
  }
  switch (range) {
    case '6h': return 30 * MIN_MS;
    case '12h': return HOUR_MS;
    case '24h': return HOUR_MS;
    case '3d': return 3 * HOUR_MS;
    case '7d': return 6 * HOUR_MS;
    case '30d': return DAY_MS;
    case 'season':
    case 'all': return DAY_MS;
    default: return HOUR_MS;
  }
}

/**
 * Consolidate repetitive conditions for the lane:
 *  1. roll points up into `rollupMs` windows and pick the dominant condition
 *     code per window (mode; ties → earliest-seen), to smooth flicker;
 *  2. collapse consecutive windows that share a code into one entry, positioned
 *     at the START of the run (when the condition began).
 * Each output point keeps a real input `time` (so it stays a valid chart x
 * category) carrying the run's dominant code + label. Pure + exported.
 */
export function consolidateConditions(points: WeatherHistoryPoint[], rollupMs: number): WeatherHistoryPoint[] {
  if (rollupMs <= 0) return points;

  interface Win { first: WeatherHistoryPoint; counts: Map<number, number>; seen: Map<number, number>; labels: Map<number, string>; }
  const wins = new Map<number, Win>();
  let seq = 0;
  for (const p of points) {
    if (p.conditionCode === undefined) continue;
    const key = Math.floor(new Date(p.time).getTime() / rollupMs) * rollupMs;
    let w = wins.get(key);
    if (!w) { w = { first: p, counts: new Map(), seen: new Map(), labels: new Map() }; wins.set(key, w); }
    const code = p.conditionCode;
    w.counts.set(code, (w.counts.get(code) ?? 0) + 1);
    if (!w.seen.has(code)) { w.seen.set(code, seq++); w.labels.set(code, p.condition ?? ''); }
  }

  // Dominant code per window → a representative point at the window's start.
  const reps: WeatherHistoryPoint[] = [...wins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, w]) => {
      let best = -1, bestCount = -1, bestSeen = Infinity;
      for (const [code, count] of w.counts) {
        const s = w.seen.get(code)!;
        if (count > bestCount || (count === bestCount && s < bestSeen)) { bestCount = count; best = code; bestSeen = s; }
      }
      const rep: WeatherHistoryPoint = { time: w.first.time, value: w.first.value, conditionCode: best };
      const label = w.labels.get(best);
      if (label) rep.condition = label;
      return rep;
    });

  // Collapse consecutive identical codes (keep the first window of each run).
  const out: WeatherHistoryPoint[] = [];
  let prev: number | undefined;
  for (const r of reps) {
    if (r.conditionCode !== prev) { out.push(r); prev = r.conditionCode; }
  }
  return out;
}

export interface LaneIcon {
  time: string;
  kind: ConditionKind;
  colorVar: string;
  condition: string;
}

/**
 * From the weather points, keep those with a mappable condition, then step down
 * (render every Nth) so that at most floor(plotWidth / MIN_ICON_GAP) icons show.
 * Pure + exported for testing. Scale-agnostic.
 */
export function selectLaneIcons(points: WeatherHistoryPoint[], plotWidth: number): LaneIcon[] {
  const mapped: LaneIcon[] = [];
  for (const p of points) {
    if (p.conditionCode === undefined) continue;
    const ico = conditionToIcon(p.conditionCode, true);
    if (!ico) continue;
    mapped.push({ time: p.time, kind: ico.kind, colorVar: ico.colorVar, condition: p.condition ?? '' });
  }
  const maxIcons = Math.max(1, Math.floor(plotWidth / MIN_ICON_GAP));
  if (mapped.length <= maxIcons) return mapped;
  const step = Math.ceil(mapped.length / maxIcons);
  return mapped.filter((_, i) => i % step === 0);
}

interface WeatherLaneProps {
  points: WeatherHistoryPoint[];
  iconSize?: number;
  /** Map a point's `time` string to the host x-axis scale input. Default: identity
   *  (categorical string axes, e.g. TempChart). Numeric time axes (e.g. ChemChart,
   *  dataKey="t" epoch ms) pass `(t) => new Date(t).getTime()`. */
  xValue?: (time: string) => string | number;
  /** When set, consolidate repetitive conditions: roll points up into windows of
   *  this size and collapse consecutive identical runs (see consolidateConditions).
   *  Use rollupMsForRange(range). Omit to render one icon per conditioned point. */
  rollupMs?: number;
}

/**
 * A weather-condition icon lane, rendered as a DIRECT CHILD of a Recharts chart.
 * Reads the live x-scale + plot rectangle via Recharts 3 hooks (useXAxisScale /
 * usePlotArea) and draws each icon at its time's pixel-x, in a band just above
 * the plot top.
 *
 * Recharts 3 deprecated <Customized> and stopped injecting chart-state props
 * (xAxisMap/offset) into it, so hooks are the supported way to reach chart
 * internals from a child. The host MUST reserve top margin for the band
 * (TempChart/ChemChart bump margin.top when the lane renders).
 */
export function WeatherLane({ points, iconSize = 18, xValue = (t) => t, rollupMs }: WeatherLaneProps) {
  // Hooks must run unconditionally, before any early return.
  const scale = useXAxisScale();
  const plot = usePlotArea();
  if (!scale || !plot) return null;

  const laneInput = rollupMs ? consolidateConditions(points, rollupMs) : points;
  const icons = selectLaneIcons(laneInput, plot.width);
  const y = Math.max(0, plot.y - iconSize - 2); // band above the plot top

  return (
    <g className="weather-lane" pointerEvents="none">
      {icons.map((ic) => {
        // Map the time string to the axis scale input: identity for categorical
        // string axes (TempChart), epoch ms for numeric time axes (ChemChart).
        // scale() returns undefined/NaN for off-domain values → skip (fail-silent).
        const cx = scale(xValue(ic.time));
        if (cx == null || !Number.isFinite(cx)) return null;
        return (
          <foreignObject key={ic.time} x={cx - iconSize / 2} y={y} width={iconSize} height={iconSize}>
            <div style={{ color: ic.colorVar, width: iconSize, height: iconSize }} title={ic.condition}>
              <ConditionGlyph kind={ic.kind} size={iconSize} />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
