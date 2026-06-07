import styles from './EventLogFlow.module.css';

export function Segmented({ options, value, onChange, accent }: { options: string[]; value: string; onChange: (v: string) => void; accent: string }) {
  return (
    <div className={styles.seg} style={{ '--accent': accent } as React.CSSProperties}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`${styles.segBtn} ${value === o ? styles.segOn : ''}`}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
