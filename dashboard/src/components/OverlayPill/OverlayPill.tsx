import styles from './OverlayPill.module.css';

interface OverlayPillProps {
  label: string;
  variant: 'pool' | 'air';
  active: boolean;
  onToggle: () => void;
}

/**
 * A temperature-overlay toggle pill with a dashed color swatch. Shared by the
 * chemistry grid, the chemistry focus sheet, and the temperature chart so the
 * Pool/Air overlay toggles look and behave identically everywhere.
 */
export function OverlayPill({ label, variant, active, onToggle }: OverlayPillProps) {
  const activeClass = active ? (variant === 'pool' ? styles.poolOn : styles.airOn) : '';
  const swatchClass = variant === 'pool' ? styles.swatchPool : styles.swatchAir;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${styles.pill} ${activeClass}`}
      onClick={onToggle}
    >
      <span className={swatchClass} aria-hidden="true" /> {label}
    </button>
  );
}
