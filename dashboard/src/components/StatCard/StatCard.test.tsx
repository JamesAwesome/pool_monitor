import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { StatCard } from './StatCard';

const mockUnit = vi.fn(() => 'F');

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: mockUnit(), toggleUnit: vi.fn() }),
}));

describe('StatCard', () => {
  beforeEach(() => {
    mockUnit.mockReturnValue('F');
  });

  it('renders label and formatted value in Fahrenheit', () => {
    render(<StatCard label="Average" value={25} loading={false} />);
    expect(screen.getByText('Average')).toBeTruthy();
    expect(screen.getByText('77.0°F')).toBeTruthy();
  });

  it('renders formatted value in Celsius', () => {
    mockUnit.mockReturnValue('C');
    render(<StatCard label="Peak" value={30} loading={false} />);
    expect(screen.getByText('30.0°C')).toBeTruthy();
  });

  it('renders "--" when loading', () => {
    render(<StatCard label="Average" value={25} loading={true} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('renders "--" when value is null', () => {
    render(<StatCard label="Average" value={null} loading={false} />);
    expect(screen.getByText('--')).toBeTruthy();
  });
});
