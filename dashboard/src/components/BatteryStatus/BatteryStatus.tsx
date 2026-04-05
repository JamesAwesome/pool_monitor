import type { SensorBattery } from '../../types';
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

function BatteryItem({ battery }: { battery: SensorBattery }) {
  if (battery.current === null) return null;

  const level = battery.current;
  const status = getBatteryStatus(level);
  const statusText = status === 'ok' ? 'OK' : status === 'warning' ? 'Low' : 'Replace';

  return (
    <div className={`${styles.item} ${styles[status]}`} data-testid="battery-item">
      <div className={styles.batteryShell}>
        <div
          className={`${styles.batteryFill} ${styles[`fill_${status}`]}`}
          style={{ width: `${level}%` }}
        />
        <div className={styles.batteryTip} />
      </div>
      <span className={styles.percentage}>{level}%</span>
      <span className={styles.label}>{statusText}</span>
      <span className={styles.sensorId}>{battery.id}</span>
    </div>
  );
}

export function BatteryStatus({ batteries, loading }: BatteryStatusProps) {
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
    <div className={styles.wrapper} data-testid="battery-badge">
      {batteries.map((b) => (
        <BatteryItem key={b.id} battery={b} />
      ))}
    </div>
  );
}
