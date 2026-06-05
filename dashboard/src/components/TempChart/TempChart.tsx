import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { celsiusToFahrenheit } from '../../utils/temperature';
import { DateRangePicker } from '../DateRangePicker';
import { BottomSheet } from '../BottomSheet';
import { OverlayPill } from '../OverlayPill';
import { WeatherLane } from '../WeatherLane';
import { SwimLane } from '../SwimLane';
import type { TimeSeriesPoint, WeatherHistoryPoint, SwimSession } from '../../types';
import styles from './TempChart.module.css';

interface TempChartProps {
  data: TimeSeriesPoint[];
  range: string;
  onRangeChange: (range: string) => void;
  loading: boolean;
  airHistory?: WeatherHistoryPoint[];
  swims?: SwimSession[];
}

const QUICK_RANGES = [
  { key: '6h', label: '6H' },
  { key: '12h', label: '12H' },
  { key: '24h', label: '24H' },
  { key: '3d', label: '3D' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

function formatXTick(time: string, range: string, spansMultipleDays: boolean): string {
  const date = new Date(time);
  if (range === '30d' || range.startsWith('custom:')) {
    // Long ranges: date only, rely on minTickGap to prevent repeats
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (spansMultipleDays || range.endsWith('d')) {
    // Multi-day or short day ranges: include both date and time to avoid duplicates
    return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(undefined, { hour: 'numeric' })}`;
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function TempChart({ data, range, onRangeChange, loading, airHistory, swims }: TempChartProps) {
  const { unit } = useTheme();
  const isFahrenheit = unit === 'F';

  const [showCustom, setShowCustom] = useState(false);
  const [airVisible, setAirVisible] = useState(true);
  const [swimVisible, setSwimVisible] = useState(true);
  const hasAir = !!airHistory && airHistory.length > 0;
  const hasSwims = !!swims && swims.length > 0;

  const condByTime = useMemo(
    () => new Map((airHistory ?? []).filter((p) => p.condition).map((p) => [p.time, p.condition!])),
    [airHistory],
  );

  const smoothedPool = useMemo(() => {
    if (data.length === 0) return data;
    const alpha = 0.25;
    const out: TimeSeriesPoint[] = [];
    let ema = data[0].value;
    for (const pt of data) {
      ema = alpha * pt.value + (1 - alpha) * ema;
      out.push({ time: pt.time, value: ema });
    }
    return out;
  }, [data]);

  const chartData = useMemo(() => {
    type ChartPoint = { time: string; value: number | undefined; airValue?: number };
    const poolMap = new Map<string, ChartPoint>(
      smoothedPool.map((pt) => [
        pt.time,
        { time: pt.time, value: isFahrenheit ? celsiusToFahrenheit(pt.value) : pt.value },
      ]),
    );

    if (airHistory && airHistory.length > 0) {
      for (const pt of airHistory) {
        const airVal = isFahrenheit ? celsiusToFahrenheit(pt.value) : pt.value;
        const existing = poolMap.get(pt.time);
        if (existing) {
          existing.airValue = airVal;
        } else {
          // Air-only point: no pool reading at this timestamp. Recharts renders
          // the undefined pool value as a gap.
          poolMap.set(pt.time, { time: pt.time, value: undefined, airValue: airVal });
        }
      }
    }

    return Array.from(poolMap.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [smoothedPool, airHistory, isFahrenheit]);

  const swimSeries = useMemo(
    () => chartData.map((d) => ({ t: new Date(d.time).getTime(), value: d.value })),
    [chartData],
  );

  const spansMultipleDays = useMemo(() => {
    if (data.length < 2) return false;
    const first = new Date(data[0].time);
    const last = new Date(data[data.length - 1].time);
    return first.toDateString() !== last.toDateString();
  }, [data]);

  const unitLabel = isFahrenheit ? '°F' : '°C';

  return (
    <div className={styles.card}>
      <div className={styles.controls}>
        {QUICK_RANGES.map((r) => (
          <button
            key={r.key}
            className={`${styles.rangeBtn} ${r.key === range ? styles.active : ''}`}
            onClick={() => { onRangeChange(r.key); setShowCustom(false); }}
            type="button"
          >
            {r.label}
          </button>
        ))}
        <button
          className={`${styles.rangeBtn} ${showCustom ? styles.active : ''}`}
          onClick={() => setShowCustom(!showCustom)}
          type="button"
        >
          Custom
        </button>
      </div>

      {(hasAir || hasSwims) && (
        <div className={styles.overlayRow}>
          {hasAir && (
            <OverlayPill label="Air" variant="air" active={airVisible} onToggle={() => setAirVisible((v) => !v)} />
          )}
          {hasSwims && (
            <button
              type="button"
              aria-pressed={swimVisible}
              className={`${styles.swimToggle} ${swimVisible ? styles.swimToggleOn : ''}`}
              onClick={() => setSwimVisible((v) => !v)}
            >
              🦦 Swim
            </button>
          )}
        </div>
      )}

      <BottomSheet open={showCustom} onClose={() => setShowCustom(false)} title="Custom range">
        <DateRangePicker
          onApply={(from, to) => {
            onRangeChange(`custom:${from}:${to}`);
            setShowCustom(false);
          }}
        />
      </BottomSheet>

      <div className={styles.chartWrap}>
        {loading ? (
          <div className={styles.loading}>Loading chart...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* Reserve top headroom for the weather lane (18px icons + gap) only
                when it renders, so icons sit in a clean band above the plot
                rather than overlapping the chart lines. */}
            <ComposedChart data={chartData} margin={{ top: hasAir ? 26 : 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#0ea5e9" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
              {hasAir && <WeatherLane points={airHistory!} iconSize={18} collapse />}
              {hasSwims && swimVisible && (
                <SwimLane swims={swims} series={swimSeries} xMode="index" color="#38bdf8" />
              )}
              <XAxis
                dataKey="time"
                tickFormatter={(t: string) => formatXTick(t, range, spansMultipleDays)}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                stroke="transparent"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={spansMultipleDays || range.endsWith('d') ? 80 : 50}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}${unitLabel}`}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                stroke="transparent"
                tickLine={false}
                axisLine={false}
                width={56}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : Number(value);
                  const n = String(name);
                  return [`${v.toFixed(1)}${unitLabel}`, n === 'Air' ? 'Air temp' : 'Pool temp'];
                }}
                labelFormatter={(label) => {
                  const base = new Date(String(label)).toLocaleString();
                  const cond = condByTime.get(String(label));
                  return cond ? `${base} · ${cond}` : base;
                }}
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                  color: '#e2e8f0',
                  fontSize: '13px',
                  padding: '10px 14px',
                }}
                cursor={{ stroke: 'rgba(56, 189, 248, 0.3)', strokeWidth: 1 }}
              />
              <Area
                type="basis"
                dataKey="value"
                name="Pool"
                stroke="#38bdf8"
                strokeWidth={2.5}
                fill="url(#tempGradient)"
                dot={false}
                activeDot={{ r: 5, fill: '#38bdf8', stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {hasAir && (
                <Line
                  type="monotone"
                  dataKey="airValue"
                  stroke="var(--color-air-temp)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--color-air-temp)', stroke: '#fff', strokeWidth: 1.5 }}
                  name="Air"
                  connectNulls={true}
                  isAnimationActive={false}
                  hide={!airVisible}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
