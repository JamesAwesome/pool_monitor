import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Theme, TemperatureUnit } from '../types';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  unit: TemperatureUnit;
  toggleUnit: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'pool-dashboard-theme';
const UNIT_KEY = 'pool-dashboard-unit';

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function hadSavedTheme(): boolean {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark';
}

function getInitialUnit(): TemperatureUnit {
  const saved = localStorage.getItem(UNIT_KEY);
  if (saved === 'C' || saved === 'F') return saved;
  return 'F';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const hasManuallyToggled = useRef(hadSavedTheme());
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [unit, setUnit] = useState<TemperatureUnit>(getInitialUnit);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(UNIT_KEY, unit);
  }, [unit]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!hasManuallyToggled.current) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    hasManuallyToggled.current = true;
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const toggleUnit = useCallback(() => {
    setUnit((prev) => (prev === 'C' ? 'F' : 'C'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, unit, toggleUnit }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
