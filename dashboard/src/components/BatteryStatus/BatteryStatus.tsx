import { useState, useCallback } from 'react';
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
import { BottomSheet } from '../BottomSheet';
import type { SensorBattery, TimeSeriesPoint } from '../../types';
import styles from './BatteryStatus.module.css';

interface BatteryStatusProps {
  batteries: SensorBattery[];
  loading: boolean;
}

function getBatteryStatus(level: number): 'ok' | 'warning' | 'low' {
  if (level > 50) return 'ok';
  if (level > 20) return 'warning';
  return 'low';
}

function formatDate(time: string): string {
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function BatteryChart({ history, loading: chartLoading }: { history: TimeSeriesPoint[]; loading: boolean }) {
  if (chartLoading) {
    return <div className={styles.chartLoading}>Loading history...</div>;
  }

  if (history.length === 0) {
    return <div className={styles.chartLoading}>No history available</div>;
  }

  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="battGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(0)}%`, 'Battery']}
            labelFormatter={(t: string) => new Date(t).toLocaleDateString()}
            contentStyle={{
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
              backdropFilter: 'blur(12px)',
              color: '#e2e8f0',
              fontSize: '13px',
              padding: '10px 14px',
            }}
          />
          <ReferenceLine
            y={20}
            stroke="#d97706"
            strokeDasharray="6 4"
            strokeOpacity={0.7}
            label={{ value: 'Low', position: 'right', fontSize: 11, fill: '#d97706' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#16a34a"
            strokeWidth={2}
            fill="url(#battGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BatteryStatus({ batteries, loading }: BatteryStatusProps) {
  const [openSensor, setOpenSensor] = useState<SensorBattery | null>(null);
  const [history, setHistory] = useState<TimeSeriesPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleOpen = useCallback((battery: SensorBattery) => {
    setOpenSensor(battery);
    setHistory([]);
    setHistoryLoading(true);
    fetch(`/api/battery/${encodeURIComponent(battery.id)}/history`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: TimeSeriesPoint[]) => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, []);

  const handleClose = useCallback(() => {
    setOpenSensor(null);
    setHistory([]);
  }, []);

  if (loading && batteries.length === 0) {
    return (
      <div className={styles.wrapper} data-testid="battery-badge">
        <div className={styles.item}>
          <div className={styles.batteryShell}>
            <div className={styles.batteryFill} style={{ width: '0%' }} />
            <div className={styles.batteryTip} />
          </div>
          <span className={styles.percentage}>--%</span>
        </div>
      </div>
    );
  }

  if (batteries.length === 0) return null;

  return (
    <>
      <div className={styles.wrapper} data-testid="battery-badge">
        {batteries.map((b) => {
          if (b.current === null) return null;
          const level = b.current;
          const status = getBatteryStatus(level);
          const statusText = status === 'ok' ? 'OK' : status === 'warning' ? 'Low' : 'Replace';

          return (
            <button
              key={b.id}
              type="button"
              className={`${styles.item} ${styles[status]} ${styles.clickable}`}
              data-testid="battery-item"
              onClick={() => handleOpen(b)}
            >
              <div className={styles.batteryShell}>
                <div
                  className={`${styles.batteryFill} ${styles[`fill_${status}`]}`}
                  style={{ width: `${level}%` }}
                />
                <div className={styles.batteryTip} />
              </div>
              <span className={styles.percentage}>{level}%</span>
              <span className={styles.label}>{statusText}</span>
              <span className={styles.sensorId}>{b.id}</span>
              <span className={styles.chevron}>›</span>
            </button>
          );
        })}
      </div>

      <BottomSheet
        open={openSensor !== null}
        onClose={handleClose}
        title={openSensor ? `Battery · ${openSensor.id}` : 'Battery'}
      >
        {openSensor && (
          <>
            <div className={styles.sheetHeader}>
              <span className={styles.sheetModel}>{openSensor.model}</span>
              {openSensor.current !== null && (
                <span className={`${styles.sheetPct} ${styles[getBatteryStatus(openSensor.current)]}`}>
                  {openSensor.current}%
                </span>
              )}
            </div>
            <BatteryChart history={history} loading={historyLoading} />
          </>
        )}
      </BottomSheet>
    </>
  );
}
