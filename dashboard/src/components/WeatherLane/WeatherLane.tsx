import { useXAxisScale, usePlotArea } from 'recharts';
import type { WeatherHistoryPoint } from '../../types';
import { conditionToIcon, ConditionGlyph, type ConditionKind } from './conditionIcon';

const MIN_ICON_GAP = 24; // px — minimum horizontal spacing so icons never collide

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
export function WeatherLane({ points, iconSize = 18, xValue = (t) => t }: WeatherLaneProps) {
  // Hooks must run unconditionally, before any early return.
  const scale = useXAxisScale();
  const plot = usePlotArea();
  if (!scale || !plot) return null;

  const icons = selectLaneIcons(points, plot.width);
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
