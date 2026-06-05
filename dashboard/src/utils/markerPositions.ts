export interface ChartPointTV {
  t: number;                 // epoch ms
  value: number | undefined; // chart-unit y (undefined = gap)
}

/** Points with a defined value, ascending by t. */
function defined(points: ChartPointTV[]): { t: number; value: number }[] {
  return points
    .filter((p): p is { t: number; value: number } => typeof p.value === 'number')
    .sort((a, b) => a.t - b.t);
}

/**
 * Linear-interpolate the series value at epoch `t`. Uses only defined points, so
 * gaps (undefined values) are bridged. Clamps to the endpoints. Null if empty.
 */
export function interpolateValueAt(points: ChartPointTV[], t: number): number | null {
  const d = defined(points);
  if (d.length === 0) return null;
  if (t <= d[0].t) return d[0].value;
  const last = d[d.length - 1];
  if (t >= last.t) return last.value;
  for (let i = 0; i < d.length - 1; i++) {
    const a = d[i], b = d[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}

/**
 * Fractional category index (0..n-1) of epoch `t` across ALL plotted points
 * (including gaps — recharts spaces categories by index regardless of value).
 * Clamps to [0, n-1]. Null for fewer than 2 points.
 */
export function indexFractionAt(points: ChartPointTV[], t: number): number | null {
  const n = points.length;
  if (n < 2) return null;
  const ts = points.map((p) => p.t);
  if (t <= ts[0]) return 0;
  if (t >= ts[n - 1]) return n - 1;
  for (let i = 0; i < n - 1; i++) {
    if (t >= ts[i] && t <= ts[i + 1]) {
      const f = ts[i + 1] === ts[i] ? 0 : (t - ts[i]) / (ts[i + 1] - ts[i]);
      return i + f;
    }
  }
  return n - 1;
}
