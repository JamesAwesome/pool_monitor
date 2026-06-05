import styles from './OverlayPill.module.css';

interface OverlayPillProps {
  label: string;
  variant: 'pool' | 'air' | 'swim';
  active: boolean;
  onToggle: () => void;
}

/**
 * An overlay toggle pill. Shared by the chemistry grid, the chemistry focus
 * sheet, and the temperature chart so the Pool/Air/Swim toggles look and behave
 * identically everywhere. Pool/Air show a dashed color swatch; Swim shows the
 * 🦦 marker emoji.
 */
export function OverlayPill({ label, variant, active, onToggle }: OverlayPillProps) {
  const activeClass = active
    ? { pool: styles.poolOn, air: styles.airOn, swim: styles.swimOn }[variant]
    : '';
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${styles.pill} ${activeClass}`}
      onClick={onToggle}
    >
      {variant === 'swim' ? (
        <span className={styles.swatchSwim} aria-hidden="true">🦦</span>
      ) : (
        <span className={variant === 'pool' ? styles.swatchPool : styles.swatchAir} aria-hidden="true" />
      )}{' '}
      {label}
    </button>
  );
}
