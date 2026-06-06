import { useState } from 'react';
import { useXAxisScale, useYAxisScale, usePlotArea } from 'recharts';
import type { SwimSession } from '../../types';
import { interpolateValueAt, indexFractionAt, type ChartPointTV } from '../../utils/markerPositions';
import { whenLabel } from '../../utils/swim';
import { Avatars } from './Avatars';
import styles from './SwimLane.module.css';

interface SwimLaneProps {
  swims: SwimSession[];
  /** The plotted series for y-interpolation: epoch ms `t` + chart-unit `value`. */
  series: ChartPointTV[];
  /** index = categorical axis (TempChart); scale = numeric axis (ChemChart). */
  xMode: 'index' | 'scale';
  color: string;
  iconSize?: number;
  /** The recharts yAxisId the series plots against. Default 0 (TempChart's
   *  implicit axis); ChemChart's chem values live on yAxisId="chem". */
  yAxisId?: string | number;
  /** Compact mode: a small emoji bubble centred ON the curve point, no stem/foot.
   *  For tiny charts (the 66px chemistry preview cards) where a full pin won't fit. */
  compact?: boolean;
}

/** The swim's id IS its ISO-UTC instant — directly comparable to the chart
 *  series `t` (also derived from ISO instants), so it's timezone-robust. */
function swimEpoch(s: SwimSession): number {
  return new Date(s.id).getTime();
}

/**
 * A swim-session pin lane rendered as a direct recharts child (same pattern as
 * WeatherLane). Reads the live x/y scales + plot area via recharts 3 hooks and
 * renders one floating pin per in-domain swim. Hooks run unconditionally before
 * any early return, as required by React rules.
 */
export function SwimLane({ swims, series, xMode, color, iconSize = 22, yAxisId, compact = false }: SwimLaneProps) {
  // All hooks unconditionally first — required by React rules of hooks.
  const xScale = useXAxisScale();
  const yScale = useYAxisScale(yAxisId);
  const plot = usePlotArea();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!xScale || !yScale || !plot || series.length === 0) return null;

  const TIP_W = 220; // styled hover box (full charts only)
  const TIP_H = 46;

  const n = series.length;
  // Full mode: the pin grows UPWARD from the curve point — the foot sits at the
  // box bottom (on the curve) and the stem + bubble stack above it. The box must
  // be tall enough to fully contain the bubble, or the foreignObject clips it (the
  // cause of the "only the bottom half shows" bug). Height = stem(18) + gap(2) +
  // bubble(~iconSize) + headroom; the 6px foot's lower half is kept in-box by
  // offsetting the box bottom FOOT_R px below the curve point.
  // Compact mode: a small bubble centred on the curve point — box height = iconSize.
  // `iconSize` sets the box geometry (height + width floor); the emoji size is
  // `avatarSize` — scaled from iconSize in compact mode, fixed at 13 for the full pin.
  const FOOT_R = 3;
  const markerH = compact ? iconSize : iconSize + 40;
  const avatarSize = compact ? Math.round(iconSize * 0.72) : 13;

  // The series is sorted ascending by t (both hosts build it from sorted chart
  // data), so [0] / [n-1] are the visible time domain. Skip swims outside it so
  // markers never extrapolate off-plot — the numeric x-scale does not clamp.
  const tMin = series[0].t;
  const tMax = series[n - 1].t;

  return (
    <g className={styles.lane} style={{ color }} pointerEvents="none">
      {swims.map((s) => {
        const e = swimEpoch(s);
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

        // bubble width grows with the number of swimmers (uses the actual emoji size)
        const bubbleW = Math.max(iconSize * 1.2, avatarSize * 0.66 * s.people.length * 1.3 + 20);

        const n2 = s.people.length;
        const label = `${n2} ${n2 === 1 ? 'swimmer' : 'swimmers'} · ${whenLabel(s)}`;
        // Box sits above the pin; flip below if it would clip the plot top, then
        // clamp fully inside the plot rect so a parent can't cut it off.
        let tipY = cy - markerH - TIP_H;
        if (tipY < plot.y) tipY = cy + 10;
        tipY = Math.max(plot.y, Math.min(tipY, plot.y + plot.height - TIP_H));
        const tipX = Math.max(plot.x, Math.min(cx - TIP_W / 2, plot.x + plot.width - TIP_W));

        return (
          <g key={s.id}>
            <foreignObject
              x={cx - bubbleW / 2}
              y={compact ? cy - markerH / 2 : cy + FOOT_R - markerH}
              width={bubbleW}
              height={markerH}
            >
              <div className={styles.marker}>
                {compact ? (
                  <span className={styles.chromeCompact} title={label}>
                    <Avatars people={s.people} size={avatarSize} />
                  </span>
                ) : (
                  <>
                    <span
                      className={styles.chrome}
                      onMouseEnter={() => setHoveredId(s.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <Avatars people={s.people} size={avatarSize} />
                    </span>
                    <span className={styles.stem} aria-hidden="true" />
                    <span className={styles.foot} aria-hidden="true" />
                  </>
                )}
              </div>
            </foreignObject>
            {!compact && hoveredId === s.id && (
              <foreignObject x={tipX} y={tipY} width={TIP_W} height={TIP_H}>
                <div className={styles.tip} role="tooltip">{label}</div>
              </foreignObject>
            )}
          </g>
        );
      })}
    </g>
  );
}
