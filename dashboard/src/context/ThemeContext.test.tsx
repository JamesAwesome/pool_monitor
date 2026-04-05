import { vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';
import type { ReactNode } from 'react';

// Helper to create a mock matchMedia
function createMockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  const mql = {
    matches: prefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.push(handler);
    }),
    removeEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    dispatchChange: (matches: boolean) => {
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  };
  return { mql, listeners };
}

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('ThemeContext', () => {
  let mockMatchMedia: ReturnType<typeof createMockMatchMedia>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = '';
    mockMatchMedia = createMockMatchMedia(false);
    window.matchMedia = vi.fn().mockReturnValue(mockMatchMedia.mql);
  });

  describe('default theme detection', () => {
    it('defaults to light when OS prefers light', () => {
      mockMatchMedia = createMockMatchMedia(false);
      window.matchMedia = vi.fn().mockReturnValue(mockMatchMedia.mql);

      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.theme).toBe('light');
    });

    it('defaults to dark when OS prefers dark', () => {
      mockMatchMedia = createMockMatchMedia(true);
      window.matchMedia = vi.fn().mockReturnValue(mockMatchMedia.mql);

      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.theme).toBe('dark');
    });

    it('uses localStorage over OS preference', () => {
      localStorage.setItem('pool-dashboard-theme', 'dark');
      mockMatchMedia = createMockMatchMedia(false);
      window.matchMedia = vi.fn().mockReturnValue(mockMatchMedia.mql);

      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.theme).toBe('dark');
    });
  });

  describe('toggleTheme', () => {
    it('switches theme from light to dark', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.theme).toBe('light');

      act(() => result.current.toggleTheme());
      expect(result.current.theme).toBe('dark');
    });

    it('updates document.documentElement.dataset.theme', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(document.documentElement.dataset.theme).toBe('light');

      act(() => result.current.toggleTheme());
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('persists theme to localStorage', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      act(() => result.current.toggleTheme());
      expect(localStorage.getItem('pool-dashboard-theme')).toBe('dark');
    });
  });

  describe('unit toggle', () => {
    it('defaults to F', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.unit).toBe('F');
    });

    it('toggles unit from F to C', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      act(() => result.current.toggleUnit());
      expect(result.current.unit).toBe('C');
    });

    it('persists unit to localStorage', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      act(() => result.current.toggleUnit());
      expect(localStorage.getItem('pool-dashboard-unit')).toBe('C');
    });

    it('reads saved unit from localStorage', () => {
      localStorage.setItem('pool-dashboard-unit', 'C');
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.unit).toBe('C');
    });
  });

  describe('OS theme change listener', () => {
    it('follows OS changes when user has not manually toggled', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      expect(result.current.theme).toBe('light');

      act(() => mockMatchMedia.mql.dispatchChange(true));
      expect(result.current.theme).toBe('dark');
    });

    it('ignores OS changes after manual toggle', () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      act(() => result.current.toggleTheme()); // now dark, manually toggled
      act(() => mockMatchMedia.mql.dispatchChange(false)); // OS says light
      expect(result.current.theme).toBe('dark'); // stays dark
    });
  });

  describe('useTheme outside provider', () => {
    it('throws when used outside ThemeProvider', () => {
      // Suppress React error boundary console output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => renderHook(() => useTheme())).toThrow(
        'useTheme must be used within a ThemeProvider',
      );
      consoleSpy.mockRestore();
    });
  });

  describe('renders children', () => {
    it('renders children correctly', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Hello</div>
        </ThemeProvider>,
      );
      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });
  });
});

// Keep userEvent import from being flagged as unused
void userEvent;
