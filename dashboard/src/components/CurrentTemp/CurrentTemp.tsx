import { useTheme } from '../../context/ThemeContext';
import { formatTemperature, getTemperatureColor } from '../../utils/temperature';
import type { TemperatureZone } from '../../types';
import styles from './CurrentTemp.module.css';

interface CurrentTempProps {
  value: number | null;
  loading: boolean;
}

const zoneColorVar: Record<TemperatureZone, string> = {
  hot: 'var(--color-danger)',
  warm: 'var(--color-warning)',
  normal: 'var(--color-success)',
  cool: 'var(--color-primary)',
};

export function CurrentTemp({ value, loading }: CurrentTempProps) {
  const { unit } = useTheme();

  const hasValue = !loading && value !== null;
  const zone = hasValue ? getTemperatureColor(value) : undefined;
  const color = zone ? zoneColorVar[zone] : undefined;
  const displayValue = hasValue ? formatTemperature(value, unit) : null;
  const unitLabel = unit === 'F' ? '°F' : '°C';

  return (
    <div className={styles.card}>
      {loading ? (
        <span className={styles.placeholder}>Loading...</span>
      ) : value === null ? (
        <span className={styles.placeholder}>--</span>
      ) : (
        <div className={styles.tempRow}>
          <span
            className={styles.value}
            data-testid="temp-value"
            data-zone={zone}
            style={{ color }}
          >
            {displayValue}
          </span>
          <span className={styles.unit} style={{ color }}>
            {unitLabel}
          </span>
        </div>
      )}
      <p className={styles.label}>Current Pool Temperature</p>
    </div>
  );
}
