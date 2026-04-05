import { useTheme } from '../../context/ThemeContext';
import styles from './Header.module.css';

export function Header() {
  const { theme, toggleTheme, unit, toggleUnit } = useTheme();

  return (
    <header className={styles.header}>
      <nav className={styles.nav}>
        <h1 className={styles.title}>
          <span className={styles.icon} aria-hidden="true">🌊</span>
          {import.meta.env.VITE_APP_TITLE || 'Pool Dashboard'}
        </h1>
        <div className={styles.controls}>
          <button
            className={styles.toggleBtn}
            onClick={toggleUnit}
            aria-label={`Switch to degrees ${unit === 'F' ? 'Celsius' : 'Fahrenheit'}`}
          >
            °{unit === 'F' ? 'C' : 'F'}
          </button>
          <button
            className={styles.toggleBtn}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '☾' : '☀'}
          </button>
        </div>
      </nav>
    </header>
  );
}
