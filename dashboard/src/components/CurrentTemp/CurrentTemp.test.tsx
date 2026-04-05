import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { CurrentTemp } from './CurrentTemp';

const mockUnit = vi.fn(() => 'F');

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: mockUnit(), toggleUnit: vi.fn() }),
}));

describe('CurrentTemp', () => {
  beforeEach(() => {
    mockUnit.mockReturnValue('F');
  });

  it('renders loading state', () => {
    render(<CurrentTemp value={null} loading={true} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders placeholder when value is null and not loading', () => {
    render(<CurrentTemp value={null} loading={false} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('renders formatted temperature in Fahrenheit', () => {
    render(<CurrentTemp value={25} loading={false} />);
    expect(screen.getByTestId('temp-value').textContent).toBe('77.0');
    expect(screen.getByText('°F')).toBeTruthy();
  });

  it('renders formatted temperature in Celsius', () => {
    mockUnit.mockReturnValue('C');
    render(<CurrentTemp value={25} loading={false} />);
    expect(screen.getByTestId('temp-value').textContent).toBe('25.0');
    expect(screen.getByText('°C')).toBeTruthy();
  });

  it('shows label text', () => {
    render(<CurrentTemp value={25} loading={false} />);
    expect(screen.getByText('Current Pool Temperature')).toBeTruthy();
  });

  it('applies hot zone color for high temperatures', () => {
    render(<CurrentTemp value={35} loading={false} />);
    expect(screen.getByTestId('temp-value').dataset.zone).toBe('hot');
  });

  it('applies warm zone color for warm temperatures', () => {
    render(<CurrentTemp value={28} loading={false} />);
    expect(screen.getByTestId('temp-value').dataset.zone).toBe('warm');
  });

  it('applies normal zone color for moderate temperatures', () => {
    render(<CurrentTemp value={23} loading={false} />);
    expect(screen.getByTestId('temp-value').dataset.zone).toBe('normal');
  });

  it('applies cool zone color for cold temperatures', () => {
    render(<CurrentTemp value={10} loading={false} />);
    expect(screen.getByTestId('temp-value').dataset.zone).toBe('cool');
  });
});
