import type { BatteryData } from '../../types';
import styles from './BatteryStatus.module.css';

interface BatteryStatusProps {
  data: BatteryData | null;
  loading: boolean;
}

function getBatteryStatus(level: number): 'ok' | 'warning' | 'low' {
  if (level > 50) return 'ok';
  if (level > 20) return 'warning';
  return 'low';
}

export function BatteryStatus({ data, loading }: BatteryStatusProps) {
  if (loading || !data) {
    return (
      <div className={styles.wrapper} data-testid="battery-badge">
        <div className={styles.batteryShell}>
          <div className={styles.batteryFill} style={{ width: '0%' }} />
          <div className={styles.batteryTip} />
        </div>
        <span className={styles.percentage}>--%</span>
      </div>
    );
  }

  const level = data.current;
  const status = getBatteryStatus(level);
  const statusText = status === 'ok' ? 'Battery OK' : status === 'warning' ? 'Battery Low' : 'Replace Battery';

  return (
    <div className={`${styles.wrapper} ${styles[status]}`} data-testid="battery-badge">
      <div className={styles.batteryShell}>
        <div
          className={`${styles.batteryFill} ${styles[`fill_${status}`]}`}
          style={{ width: `${level}%` }}
        />
        <div className={styles.batteryTip} />
      </div>
      <span className={styles.percentage}>{level}%</span>
      <span className={styles.label}>{statusText}</span>
    </div>
  );
}
