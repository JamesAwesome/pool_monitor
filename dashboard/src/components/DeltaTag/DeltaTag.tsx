import type { Delta } from '../../utils/chemistry';
import { formatChemValue } from '../../utils/chemistry';
import styles from './DeltaTag.module.css';

interface DeltaTagProps {
  delta: Delta | null;
  decimals: number;
}

export function DeltaTag({ delta, decimals }: DeltaTagProps) {
  if (!delta) return null;
  if (delta.dir === 'flat') {
    return <span className={`${styles.tag} ${styles.flat}`}>±0</span>;
  }
  const arrow = delta.dir === 'up' ? '↑' : '↓';
  return (
    <span className={styles.tag}>
      {arrow}{formatChemValue(delta.magnitude, decimals)}
    </span>
  );
}
