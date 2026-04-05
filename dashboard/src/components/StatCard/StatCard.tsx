import { useTheme } from '../../context/ThemeContext';
import { formatTemperature } from '../../utils/temperature';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: number | null;
  loading: boolean;
}

export function StatCard({ label, value, loading }: StatCardProps) {
  const { unit } = useTheme();

  const hasValue = !loading && value !== null;
  const unitLabel = unit === 'F' ? '°F' : '°C';

  return (
    <div className={styles.card} data-testid="stat-card">
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {hasValue ? `${formatTemperature(value, unit)}${unitLabel}` : '--'}
      </span>
    </div>
  );
}
