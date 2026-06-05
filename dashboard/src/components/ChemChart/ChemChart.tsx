import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import type { ChemistryReading, ChemKey, TimeSeriesPoint, WeatherHistoryPoint, SwimSession } from '../../types';
import { buildChartData, type ChartPoint } from './buildChartData';
import { WeatherLane, collapseRuns } from '../WeatherLane';
import { SwimLane } from '../SwimLane';
import styles from './ChemChart.module.css';

/**
 * Weather-lane points for the focus chart: the full-range weather conditions
 * (so weather can be read against the chem trend, not just at readings),
 * clipped to the chart's visible x-domain so nothing renders off-plot, then
 * collapsed to one icon per change. `domainMin`/`domainMax` are epoch ms (the
 * chart's dataMin/dataMax). Pure + exported for testing.
 */
export function laneFromAirHistory(
  airHistory: WeatherHistoryPoint[],
  domainMin: number,
  domainMax: number,
): WeatherHistoryPoint[] {
  const inView = airHistory.filter((p) => {
    const t = new Date(p.time).getTime();
    return t >= domainMin && t <= domainMax;
  });
  return collapseRuns(inView);
}

/**
 * One synthetic lane point per reading, carrying the weather condition nearest
 * that reading's timestamp (so the second chem lane shows the weather at each
 * recorded test). Each point keeps the reading's id as its `time` (a valid x on
 * the numeric time axis). Readings with no weather data available are skipped.
 * Pure + exported for testing.
 */
export function weatherAtReadings(
  readings: ChemistryReading[],
  airHistory: WeatherHistoryPoint[],
): WeatherHistoryPoint[] {
  const conditioned = airHistory.filter((p) => p.conditionCode !== undefined);
  if (conditioned.length === 0) return [];
  const times = conditioned.map((p) => new Date(p.time).getTime());
  return readings.map((r) => {
    const rt = new Date(r.id).getTime();
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < conditioned.length; i++) {
      const d = Math.abs(times[i] - rt);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    const m = conditioned[bestI];
    const pt: WeatherHistoryPoint = { time: r.id, value: 0, conditionCode: m.conditionCode };
    if (m.condition) pt.condition = m.condition;
    return pt;
  });
}

interface ChemChartProps {
  readings: ChemistryReading[];
  chemKey: ChemKey;
  color: string;
  decimals: number;
  poolHistory: TimeSeriesPoint[];
  airHistory: WeatherHistoryPoint[];
  showPool: boolean;
  showAir: boolean;
  variant: 'mini' | 'full';
  swims?: SwimSession[];
}

function padDomain([min, max]: [number, number]): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

export function ChemChart({
  readings, chemKey, color, decimals, poolHistory, airHistory, showPool, showAir, variant, swims,
}: ChemChartProps) {
  const { unit } = useTheme();
  const isF = unit === 'F';
  const isFull = variant === 'full';

  const data = useMemo<ChartPoint[]>(
    () => buildChartData(readings, chemKey, poolHistory, airHistory, showPool, showAir, isF),
    [readings, chemKey, poolHistory, airHistory, showPool, showAir, isF],
  );

  const chemValues = useMemo(
    () => data.map((d) => d.chem).filter((v): v is number => typeof v === 'number'),
    [data],
  );

  const swimSeries = useMemo(
    () => data.map((d) => ({ t: d.t, value: typeof d.chem === 'number' ? d.chem : undefined })),
    [data],
  );
  const chemDomain = useMemo<[number, number]>(
    () => (chemValues.length ? padDomain([Math.min(...chemValues), Math.max(...chemValues)]) : [0, 1]),
    [chemValues],
  );

  // Weather lane spans the chart's visible time domain (data[0]..data[last]),
  // matching the temp view. With the air line on, that domain covers the full
  // weather range; with it off, it spans the readings — i.e. weather between
  // readings either way.
  const lanePoints = useMemo(
    () => (isFull && data.length > 0 ? laneFromAirHistory(airHistory, data[0].t, data[data.length - 1].t) : []),
    [isFull, data, airHistory],
  );

  // Second (lower) lane: the weather at each recorded reading's timestamp.
  const readingLanePoints = useMemo(
    () => (isFull ? weatherAtReadings(readings, airHistory) : []),
    [isFull, readings, airHistory],
  );

  // Top headroom scales with how many lane rows render (0/1/2).
  const laneRows = (lanePoints.length > 0 ? 1 : 0) + (readingLanePoints.length > 0 ? 1 : 0);
  const topMargin = laneRows === 0 ? 8 : laneRows === 1 ? 22 : 40;

  const lastChemT = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) if (typeof data[i].chem === 'number') return data[i].t;
    return null;
  }, [data]);

  const formatDateTick = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className={isFull ? styles.full : styles.mini} data-testid={`chem-chart-${chemKey}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={isFull ? { top: topMargin, right: 8, bottom: 4, left: 0 } : { top: swims && swims.length > 0 ? 12 : 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            hide={!isFull}
            tickFormatter={formatDateTick}
            tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          {/* Temperature overlay axis — hidden, independent scale (correlation, not shared units). */}
          <YAxis yAxisId="temp" hide domain={['auto', 'auto']} />
          <YAxis yAxisId="chem" hide={!isFull} orientation="left" domain={chemDomain} width={36}
            tickFormatter={(v: number) => v.toFixed(decimals)}
            tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
            tickLine={false} axisLine={false} ticks={isFull ? [chemDomain[0], (chemDomain[0] + chemDomain[1]) / 2, chemDomain[1]] : undefined} />

          {showPool && (
            <Area yAxisId="temp" type="monotone" dataKey="pool" stroke="var(--ghost-stroke)" strokeWidth={1.5}
              strokeDasharray="2 3" fill="var(--ghost-fill)" dot={false} connectNulls isAnimationActive={false} />
          )}
          {showAir && (
            <Line yAxisId="temp" type="monotone" dataKey="air" stroke="var(--air-stroke)" strokeWidth={1.5}
              strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
          )}
          <Line yAxisId="chem" type="monotone" dataKey="chem" stroke={color} strokeWidth={2}
            connectNulls isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; payload?: ChartPoint }) => {
              const { cx, cy, payload } = props;
              if (cx == null || cy == null || payload?.chem == null) return <g />;
              const isLast = payload.t === lastChemT;
              return <circle cx={cx} cy={cy} r={isLast ? 3.4 : 2.2} fill={color} />;
            }}
            activeDot={{ r: 3.4, fill: color }} />
          {/* Top row: ambient weather across the range (change-only). Lifted one
              row when the per-reading row below it is also present. */}
          {isFull && lanePoints.length > 0 && (
            <WeatherLane points={lanePoints} iconSize={16} xValue={(t) => new Date(t).getTime()}
              laneOffset={readingLanePoints.length > 0 ? 18 : 0} />
          )}
          {/* Bottom row: weather at each recorded reading timestamp. */}
          {isFull && readingLanePoints.length > 0 && (
            <WeatherLane points={readingLanePoints} iconSize={16} xValue={(t) => new Date(t).getTime()} />
          )}
          {swims && swims.length > 0 && (
            <SwimLane swims={swims} series={swimSeries} xMode="scale" color={color} yAxisId="chem"
              compact={!isFull} iconSize={isFull ? 22 : 16} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
