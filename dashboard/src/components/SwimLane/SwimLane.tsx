import { useXAxisScale, useYAxisScale, usePlotArea } from 'recharts';
import type { SwimSession } from '../../types';
import { interpolateValueAt, indexFractionAt, type ChartPointTV } from '../../utils/markerPositions';
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
export function SwimLane({ swims, series, xMode, color, iconSize = 22, yAxisId }: SwimLaneProps) {
  // All hooks unconditionally first — required by React rules of hooks.
  const xScale = useXAxisScale();
  const yScale = useYAxisScale(yAxisId);
  const plot = usePlotArea();

  if (!xScale || !yScale || !plot || series.length === 0) return null;

  const n = series.length;
  // foreignObject height: bubble (~iconSize px) + stem (18px) centred over foot.
  // The marker uses absolute positioning with the foot at 50% of the foreignObject,
  // so we set y = cy - markerH/2 to land the foot exactly on the curve point.
  const markerH = iconSize + 30; // enough room for chrome + 18px stem + 6px foot
  const markerHalf = Math.round(markerH / 2);

  return (
    <g className={styles.lane} style={{ color }} pointerEvents="none">
      {swims.map((s) => {
        const e = swimEpoch(s);

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

        // bubble width grows with the number of swimmers
        const bubbleW = Math.max(iconSize * 1.2, 13 * 0.66 * s.people.length * 1.3 + 20);

        return (
          <foreignObject
            key={s.id}
            x={cx - bubbleW / 2}
            y={cy - markerHalf}
            width={bubbleW}
            height={markerH}
          >
            <div className={styles.marker}>
              <span className={styles.chrome}>
                <Avatars people={s.people} size={13} />
              </span>
              <span className={styles.stem} aria-hidden="true" />
              <span className={styles.foot} aria-hidden="true" />
            </div>
          </foreignObject>
        );
      })}
    </g>
  );
}
