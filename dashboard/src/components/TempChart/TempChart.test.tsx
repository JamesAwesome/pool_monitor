import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { TempChart } from './TempChart';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-container">{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Area: () => <div data-testid="chart-line" />,
  Line: () => <div data-testid="chart-air-line" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
}));

const sampleData = [
  { time: '2025-07-01T12:00:00Z', value: 25 },
  { time: '2025-07-01T13:00:00Z', value: 26 },
  { time: '2025-07-01T14:00:00Z', value: 27 },
];

describe('TempChart', () => {
  it('renders chart container with data', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    expect(screen.getByTestId('chart-container')).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('renders range buttons', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    expect(screen.getByText('6H')).toBeTruthy();
    expect(screen.getByText('12H')).toBeTruthy();
    expect(screen.getByText('24H')).toBeTruthy();
    expect(screen.getByText('3D')).toBeTruthy();
    expect(screen.getByText('7D')).toBeTruthy();
    expect(screen.getByText('30D')).toBeTruthy();
    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('calls onRangeChange when a range button is clicked', () => {
    const handleChange = vi.fn();
    render(<TempChart data={sampleData} range="24h" onRangeChange={handleChange} loading={false} />);
    fireEvent.click(screen.getByText('6H'));
    expect(handleChange).toHaveBeenCalledWith('6h');
    fireEvent.click(screen.getByText('7D'));
    expect(handleChange).toHaveBeenCalledWith('7d');
  });

  it('shows loading state', () => {
    render(<TempChart data={[]} range="24h" onRangeChange={vi.fn()} loading={true} />);
    expect(screen.getByText('Loading chart...')).toBeTruthy();
  });

  it('renders with empty data', () => {
    render(<TempChart data={[]} range="24h" onRangeChange={vi.fn()} loading={false} />);
    expect(screen.getByTestId('chart-container')).toBeTruthy();
  });
});
