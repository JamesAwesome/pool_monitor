import { useTheme } from '../../context/ThemeContext';
import { formatTemperature } from '../../utils/temperature';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: number | null;
  loading: boolean;
  icon?: string;
  accentColor?: string;
}

export function StatCard({ label, value, loading, icon, accentColor }: StatCardProps) {
  const { unit } = useTheme();
  const hasValue = !loading && value !== null;
  const unitLabel = unit === 'F' ? '°F' : '°C';

  return (
    <div
      className={styles.card}
      style={accentColor ? { borderTop: `3px solid ${accentColor}` } : undefined}
      data-testid="stat-card"
    >
      <div className={styles.header}>
        {icon && <span className={styles.icon} style={{ color: accentColor }}>{icon}</span>}
        <span className={styles.label}>{label}</span>
      </div>
      <span className={styles.value} style={accentColor ? { color: accentColor } : undefined}>
        {hasValue ? `${formatTemperature(value, unit)}${unitLabel}` : '--'}
      </span>
    </div>
  );
}
