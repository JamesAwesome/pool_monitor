import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders chevron and calls onClick when provided', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<StatCard label="Test" value={25} loading={false} onClick={onClick} />);
    expect(screen.getByText('›')).toBeTruthy();
    await user.click(screen.getByTestId('stat-card'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render chevron without onClick', () => {
    render(<StatCard label="Test" value={25} loading={false} />);
    expect(screen.queryByText('›')).toBeNull();
  });
});
