import type { BatteryData } from '../../types';
import styles from './BatteryStatus.module.css';

interface BatteryStatusProps {
  data: BatteryData | null;
  loading: boolean;
}

export function BatteryStatus({ data, loading }: BatteryStatusProps) {
  if (loading || !data) {
    return <span className={styles.badge} data-testid="battery-badge">--</span>;
  }

  const isOk = data.current === 100;

  return (
    <span
      className={`${styles.badge} ${isOk ? styles.ok : styles.low}`}
      data-testid="battery-badge"
    >
      {isOk ? 'Battery OK' : 'Battery Low'}
    </span>
  );
}
