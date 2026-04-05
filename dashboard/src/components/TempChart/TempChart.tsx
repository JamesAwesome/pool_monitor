import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { celsiusToFahrenheit } from '../../utils/temperature';
import { DateRangePicker } from '../DateRangePicker';
import type { TimeSeriesPoint } from '../../types';
import styles from './TempChart.module.css';

interface TempChartProps {
  data: TimeSeriesPoint[];
  range: string;
  onRangeChange: (range: string) => void;
  loading: boolean;
}

const QUICK_RANGES = [
  { key: '6h', label: '6H' },
  { key: '12h', label: '12H' },
  { key: '24h', label: '24H' },
  { key: '3d', label: '3D' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];
const THRESHOLD_C = 32.2;

function formatXTick(time: string, range: string): string {
  const date = new Date(time);
  if (range === '7d') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function TempChart({ data, range, onRangeChange, loading }: TempChartProps) {
  const { unit } = useTheme();
  const isFahrenheit = unit === 'F';

  const [showCustom, setShowCustom] = useState(false);

  const chartData = useMemo(
    () =>
      data.map((pt) => ({
        time: pt.time,
        value: isFahrenheit ? celsiusToFahrenheit(pt.value) : pt.value,
      })),
    [data, isFahrenheit],
  );

  const thresholdValue = isFahrenheit ? celsiusToFahrenheit(THRESHOLD_C) : THRESHOLD_C;
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

      {showCustom && (
        <DateRangePicker
          onApply={(from, to) => {
            onRangeChange(`custom:${from}:${to}`);
            setShowCustom(false);
          }}
        />
      )}

      <div className={styles.chartWrap}>
        {loading ? (
          <div className={styles.loading}>Loading chart...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#0ea5e9" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={(t: string) => formatXTick(t, range)}
                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                stroke="transparent"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
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
                formatter={(v: number) => [`${v.toFixed(1)}${unitLabel}`, 'Temperature']}
                labelFormatter={(t: string) => new Date(t).toLocaleString()}
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
              <ReferenceLine y={thresholdValue} stroke="#f87171" strokeDasharray="6 4" strokeOpacity={0.7}
                label={{ value: `${thresholdValue.toFixed(1)}${unitLabel}`, position: 'right', fontSize: 11, fill: '#f87171' }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#38bdf8"
                strokeWidth={2.5}
                fill="url(#tempGradient)"
                dot={false}
                activeDot={{ r: 5, fill: '#38bdf8', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
