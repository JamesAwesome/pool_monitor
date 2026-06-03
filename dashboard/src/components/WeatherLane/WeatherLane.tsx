import { Customized } from 'recharts';
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

interface CustomizedProps {
  xAxisMap?: Record<string, { scale: (v: string) => number; x: number; width: number }>;
  offset?: { top: number; left: number; width: number; height: number };
}

interface WeatherLaneProps {
  points: WeatherHistoryPoint[];
  iconSize?: number;
}

/**
 * Renders as a Recharts <Customized> layer: reads the real categorical x-scale +
 * plot offset and draws each kept icon at its time's pixel-x, in a band just
 * below the top margin. Aligns to the plot (not the axis) automatically.
 */
function LaneLayer({ xAxisMap, offset, points, iconSize = 18 }: CustomizedProps & WeatherLaneProps) {
  if (!xAxisMap || !offset) return null;
  const axis = Object.values(xAxisMap)[0];
  if (!axis) return null;
  const icons = selectLaneIcons(points, offset.width);
  const y = Math.max(0, offset.top - iconSize - 2); // band above the plot
  return (
    <g className="weather-lane" pointerEvents="none">
      {icons.map((ic) => {
        // Categorical x-axis: pass the raw time STRING (matches a chart category).
        // Passing an epoch number would return NaN. See WeatherLane investigation.
        const cx = axis.scale(ic.time);
        if (!Number.isFinite(cx)) return null;
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

export function WeatherLane({ points, iconSize }: WeatherLaneProps) {
  return <Customized component={(props: CustomizedProps) => (
    <LaneLayer {...props} points={points} iconSize={iconSize} />
  )} />;
}
