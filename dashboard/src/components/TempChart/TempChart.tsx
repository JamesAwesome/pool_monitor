import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { celsiusToFahrenheit } from '../../utils/temperature';
import type { TimeSeriesPoint } from '../../types';
import styles from './TempChart.module.css';

interface TempChartProps {
  data: TimeSeriesPoint[];
  range: string;
  onRangeChange: (range: string) => void;
  loading: boolean;
}

const RANGES = ['6h', '12h', '24h', '7d'];
const THRESHOLD_C = 26.7;

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
        {RANGES.map((r) => (
          <button
            key={r}
            className={`${styles.rangeBtn} ${r === range ? styles.active : ''}`}
            onClick={() => onRangeChange(r)}
            type="button"
          >
            {r}
          </button>
        ))}
      </div>

      <div className={styles.chartWrap}>
        {loading ? (
          <div className={styles.loading}>Loading chart...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="time"
                tickFormatter={(t: string) => formatXTick(t, range)}
                tick={{ fontSize: 12 }}
                stroke="var(--color-text-secondary)"
              />
              <YAxis
                tickFormatter={(v: number) => `${v}${unitLabel}`}
                tick={{ fontSize: 12 }}
                stroke="var(--color-text-secondary)"
                width={56}
              />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}${unitLabel}`, 'Temperature']}
                labelFormatter={(t: string) => new Date(t).toLocaleString()}
              />
              <ReferenceLine
                y={thresholdValue}
                stroke="var(--color-danger)"
                strokeDasharray="6 4"
                label={{ value: `${thresholdValue.toFixed(1)}${unitLabel}`, position: 'right', fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1a6fc4"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
