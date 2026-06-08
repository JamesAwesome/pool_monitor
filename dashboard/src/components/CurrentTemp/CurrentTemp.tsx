import { useTheme } from '../../context/ThemeContext';
import { formatTemperature, getTemperatureColor } from '../../utils/temperature';
import type { TemperatureZone, WeatherCurrent } from '../../types';
import { AirTempReadout } from '../AirTempReadout/AirTempReadout';
import { formatUpdatedAt } from '../../utils/lastUpdated';
import styles from './CurrentTemp.module.css';

interface CurrentTempProps {
  value: number | null;
  loading: boolean;
  airCurrent?: WeatherCurrent | null;
  currentTime?: string | null;
}

const zoneColorVar: Record<TemperatureZone, string> = {
  hot: 'var(--color-danger)',
  warm: 'var(--color-warning)',
  normal: 'var(--color-success)',
  cool: 'var(--color-primary)',
};

export function CurrentTemp({ value, loading, airCurrent, currentTime }: CurrentTempProps) {
  const { unit } = useTheme();

  const hasValue = !loading && value !== null;
  const zone = hasValue ? getTemperatureColor(value) : undefined;
  const color = zone ? zoneColorVar[zone] : undefined;
  const displayValue = hasValue ? formatTemperature(value, unit) : null;
  const unitLabel = unit === 'F' ? '°F' : '°C';
  const updatedLabel = loading ? null : formatUpdatedAt(currentTime ?? null);

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
      <AirTempReadout data={airCurrent ?? null} unit={unit} />
      <p className={styles.label}>Current Pool Temperature</p>
      {updatedLabel && <p className={styles.updated}>{updatedLabel}</p>}
    </div>
  );
}
