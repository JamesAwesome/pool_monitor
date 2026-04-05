import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./hooks/usePoolData', () => ({
  usePoolData: () => ({
    stats: { current: 25.0, average: 24.0, peak: 27.0, seasonAvg: 23.0, seasonPeak: 28.0 },
    history: [{ time: '2026-04-04T10:00:00Z', value: 25.0 }],
    battery: { current: 100, history: [] },
    range: '12h',
    setRange: vi.fn(),
    loading: false,
    error: null,
    sensors: [{ id: '29908', model: 'Inkbird-ITH20R' }],
    selectedSensor: null,
    setSelectedSensor: vi.fn(),
  }),
}));

vi.mock('./context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({
    theme: 'light' as const,
    toggleTheme: vi.fn(),
    unit: 'F' as const,
    toggleUnit: vi.fn(),
  }),
}));

describe('App', () => {
  it('renders the header', () => {
    render(<App />);
    expect(screen.getByText('Pool Dashboard')).toBeTruthy();
  });

  it('renders the current temperature', () => {
    render(<App />);
    expect(screen.getByText('Current Pool Temperature')).toBeTruthy();
  });

  it('renders stat cards', () => {
    render(<App />);
    expect(screen.getByText('Average')).toBeTruthy();
    expect(screen.getByText('Peak')).toBeTruthy();
  });

  it('renders the footer', () => {
    render(<App />);
    expect(screen.getByText(/Pool Monitor/)).toBeTruthy();
  });

  it('does not show error when none exists', () => {
    render(<App />);
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});
