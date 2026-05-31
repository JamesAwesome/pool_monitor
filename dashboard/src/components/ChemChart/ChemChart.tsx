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
import { celsiusToFahrenheit } from '../../utils/temperature';
import type { ChemistryReading, ChemKey, TimeSeriesPoint } from '../../types';
import styles from './ChemChart.module.css';

interface ChemChartProps {
  readings: ChemistryReading[];
  chemKey: ChemKey;
  color: string;
  decimals: number;
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  showPool: boolean;
  showAir: boolean;
  variant: 'mini' | 'full';
}

interface ChartPoint {
  t: number;        // epoch ms (numeric x for a shared time domain)
  chem?: number;
  pool?: number;
  air?: number;
}

function padDomain([min, max]: [number, number]): [number, number] {
  if (min === max) return [min - 1, max + 1];
  const pad = (max - min) * 0.15;
  return [min - pad, max + pad];
}

export function ChemChart({
  readings, chemKey, color, decimals, poolHistory, airHistory, showPool, showAir, variant,
}: ChemChartProps) {
  const { unit } = useTheme();
  const isF = unit === 'F';
  const isFull = variant === 'full';

  const data = useMemo<ChartPoint[]>(() => {
    const byTime = new Map<number, ChartPoint>();
    const get = (iso: string) => {
      const t = new Date(iso).getTime();
      let p = byTime.get(t);
      if (!p) { p = { t }; byTime.set(t, p); }
      return p;
    };
    for (const r of readings) {
      const v = r[chemKey];
      if (typeof v === 'number') get(r.date).chem = v;
    }
    if (showPool) for (const p of poolHistory) get(p.time).pool = isF ? celsiusToFahrenheit(p.value) : p.value;
    if (showAir) for (const p of airHistory) get(p.time).air = isF ? celsiusToFahrenheit(p.value) : p.value;
    return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
  }, [readings, chemKey, poolHistory, airHistory, showPool, showAir, isF]);

  const chemValues = useMemo(
    () => data.map((d) => d.chem).filter((v): v is number => typeof v === 'number'),
    [data],
  );
  const chemDomain = useMemo<[number, number]>(
    () => (chemValues.length ? padDomain([Math.min(...chemValues), Math.max(...chemValues)]) : [0, 1]),
    [chemValues],
  );

  const lastChemT = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) if (typeof data[i].chem === 'number') return data[i].t;
    return null;
  }, [data]);

  const formatDateTick = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className={isFull ? styles.full : styles.mini} data-testid={`chem-chart-${chemKey}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={isFull ? { top: 8, right: 8, bottom: 4, left: 0 } : { top: 4, right: 4, bottom: 0, left: 0 }}>
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
