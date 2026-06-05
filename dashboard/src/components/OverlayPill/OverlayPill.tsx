import styles from './OverlayPill.module.css';

interface OverlayPillProps {
  label: string;
  variant: 'pool' | 'air' | 'swim' | 'events';
  active: boolean;
  onToggle: () => void;
}

/**
 * An overlay toggle pill. Shared by the chemistry grid, the chemistry focus
 * sheet, and the temperature chart so the Pool/Air/Swim/Events toggles look and
 * behave identically everywhere. Pool/Air show a dashed color swatch; Swim shows
 * the 🦦 marker emoji; Events shows the 🧰 marker emoji.
 */
export function OverlayPill({ label, variant, active, onToggle }: OverlayPillProps) {
  const activeClass = active
    ? { pool: styles.poolOn, air: styles.airOn, swim: styles.swimOn, events: styles.eventsOn }[variant]
    : '';
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${styles.pill} ${activeClass}`}
      onClick={onToggle}
    >
      {variant === 'swim' || variant === 'events' ? (
        <span className={styles.swatchSwim} aria-hidden="true">{variant === 'events' ? '🧰' : '🦦'}</span>
      ) : (
        <span className={variant === 'pool' ? styles.swatchPool : styles.swatchAir} aria-hidden="true" />
      )}{' '}
      {label}
    </button>
  );
}
