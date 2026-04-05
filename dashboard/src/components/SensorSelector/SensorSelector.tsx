import type { SensorInfo } from '../../types';
import styles from './SensorSelector.module.css';

interface SensorSelectorProps {
  sensors: SensorInfo[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function SensorSelector({ sensors, selected, onSelect }: SensorSelectorProps) {
  if (sensors.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.chips}>
        <button
          type="button"
          className={`${styles.chip} ${selected === null ? styles.active : ''}`}
          onClick={() => onSelect(null)}
        >
          All
        </button>
        <span className={styles.separator} />
        {sensors.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.chip} ${selected === s.id ? styles.active : ''}`}
            onClick={() => onSelect(s.id)}
          >
            {s.id} · {s.model}
          </button>
        ))}
      </div>
    </div>
  );
}
