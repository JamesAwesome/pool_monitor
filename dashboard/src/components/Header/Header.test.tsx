import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Header } from './Header';

const mockToggleTheme = vi.fn();
const mockToggleUnit = vi.fn();

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light' as const,
    toggleTheme: mockToggleTheme,
    unit: 'F' as const,
    toggleUnit: mockToggleUnit,
  }),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the title', () => {
    render(<Header />);
    expect(screen.getByText('Pool Dashboard')).toBeTruthy();
  });

  it('shows unit toggle button', () => {
    render(<Header />);
    expect(screen.getByLabelText('Switch to degrees Celsius')).toBeTruthy();
  });

  it('shows theme toggle button', () => {
    render(<Header />);
    expect(screen.getByLabelText('Switch to dark mode')).toBeTruthy();
  });

  it('calls toggleUnit on unit button click', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByLabelText('Switch to degrees Celsius'));
    expect(mockToggleUnit).toHaveBeenCalledOnce();
  });

  it('calls toggleTheme on theme button click', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByLabelText('Switch to dark mode'));
    expect(mockToggleTheme).toHaveBeenCalledOnce();
  });
});
