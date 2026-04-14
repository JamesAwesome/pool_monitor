import styles from './AirTempReadout.module.css';
import { celsiusToFahrenheit } from '../../utils/temperature';
import type { WeatherCurrent } from '../../types';

interface Props {
  data: WeatherCurrent | null;
  unit: 'F' | 'C';
}

export function AirTempReadout({ data, unit }: Props) {
  if (!data) return null;
  const value =
    unit === 'F'
      ? Math.round(celsiusToFahrenheit(data.temperature_C))
      : Math.round(data.temperature_C);
  return (
    <div className={styles.readout}>
      <span className={styles.label}>Air</span>
      <span className={styles.value}>
        {value}°{unit}
      </span>
      <span className={styles.condition}>· {data.condition}</span>
    </div>
  );
}
