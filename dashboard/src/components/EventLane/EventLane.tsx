import { useXAxisScale, useYAxisScale, usePlotArea } from 'recharts';
import type { PoolEvent } from '../../types';
import { interpolateValueAt, indexFractionAt, type ChartPointTV } from '../../utils/markerPositions';
import { EVENT_KINDS } from '../../constants/events';
import styles from './EventLane.module.css';

interface EventLaneProps {
  events: PoolEvent[];
  /** The plotted series for y-interpolation: epoch ms `t` + chart-unit `value`. */
  series: ChartPointTV[];
  /** index = categorical axis (TempChart); scale = numeric axis (ChemChart). */
  xMode: 'index' | 'scale';
  iconSize?: number;
  /** The recharts yAxisId the series plots against. Default 0 (TempChart's
   *  implicit axis); ChemChart's chem values live on yAxisId="chem". */
  yAxisId?: string | number;
  /** Compact mode: a small chip centred ON the curve point, no stem/foot.
   *  For tiny charts (the 66px chemistry preview cards) where a full pin won't fit. */
  compact?: boolean;
}

/** The event's id IS its ISO-UTC instant — directly comparable to the chart
 *  series `t` (also derived from ISO instants), so it's timezone-robust. */
function eventEpoch(e: PoolEvent): number {
  return new Date(e.id).getTime();
}

/**
 * A maintenance-event marker lane rendered as a direct recharts child (same
 * pattern as SwimLane / WeatherLane). Reads the live x/y scales + plot area via
 * recharts 3 hooks and renders one floating, kind-colored chip per in-domain
 * event. Hooks run unconditionally before any early return, per React rules.
 */
export function EventLane({ events, series, xMode, iconSize = 23, yAxisId, compact = false }: EventLaneProps) {
  // All hooks unconditionally first — required by React rules of hooks.
  const xScale = useXAxisScale();
  const yScale = useYAxisScale(yAxisId);
  const plot = usePlotArea();

  if (!xScale || !yScale || !plot || series.length === 0) return null;

  const n = series.length;
  // Full mode: the pin grows UPWARD from the curve point — the foot sits at the
  // box bottom (on the curve) and the stem + chip stack above it. Box height =
  // stem(18) + gap(2) + chip(~iconSize) + headroom; the 6px foot's lower half is
  // kept in-box by offsetting the box bottom FOOT_R px below the curve point.
  // Compact mode: a small chip centred on the curve point — box height = iconSize.
  const FOOT_R = 3;
  const markerH = compact ? iconSize : iconSize + 40;

  // The series is sorted ascending by t (both hosts build it from sorted chart
  // data), so [0] / [n-1] are the visible time domain. Skip events outside it so
  // markers never extrapolate off-plot — the numeric x-scale does not clamp.
  const tMin = series[0].t;
  const tMax = series[n - 1].t;

  return (
    <g className={styles.lane} pointerEvents="none">
      {events.map((ev) => {
        const e = eventEpoch(ev);
        // Off-domain → skip (fail-silent), so markers stay inside the plot in
        // both modes (scale-mode xScale would otherwise extrapolate off-plot).
        if (e < tMin || e > tMax) return null;

        // y-position: interpolate the curve value at this epoch → pixel y
        const yVal = interpolateValueAt(series, e);
        if (yVal == null) return null;
        const cy = yScale(yVal) as number;
        if (!Number.isFinite(cy)) return null;

        // x-position: index mode (categorical axis) or scale mode (numeric axis)
        let cx: number | undefined;
        if (xMode === 'index') {
          const frac = indexFractionAt(series, e);
          if (frac == null) return null;
          cx = plot.x + (frac / (n - 1)) * plot.width;
        } else {
          cx = xScale(e) as number;
        }
        if (cx == null || !Number.isFinite(cx)) return null;

        const k = EVENT_KINDS[ev.kind];
        const boxW = compact ? iconSize : iconSize + 2;

        return (
          <foreignObject
            key={ev.id}
            x={cx - boxW / 2}
            y={compact ? cy - markerH / 2 : cy + FOOT_R - markerH}
            width={boxW}
            height={markerH}
          >
            {/* color flows to currentColor on the stem/foot/chip border */}
            <div className={styles.marker} style={{ color: k.color }}>
              {!compact && <span className={styles.stem} aria-hidden="true" />}
              {!compact && <span className={styles.foot} aria-hidden="true" />}
              <span
                className={`${styles.chip} ${compact ? styles.chipCompact : ''}`}
                style={{ background: k.tint, borderColor: k.color }}
                title={k.noun}
              >
                <span className={styles.ico}>{k.icon}</span>
              </span>
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
