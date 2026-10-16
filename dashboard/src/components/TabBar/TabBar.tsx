import styles from './TabBar.module.css';

export type TabKey = 'temperature' | 'chemistry' | 'season';

interface TabBarProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'chemistry', label: 'Chemistry' },
  { key: 'season', label: 'Season' },
];

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className={styles.bar} role="tablist">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={`${styles.tab} ${active === t.key ? styles.active : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
