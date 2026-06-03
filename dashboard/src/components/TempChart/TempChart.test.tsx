import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { TempChart } from './TempChart';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), unit: 'F', toggleUnit: vi.fn() }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-container">{children}</div>,
  ComposedChart: ({ children, margin }: { children: React.ReactNode; margin?: { top?: number } }) => (
    <div data-testid="line-chart" data-margin-top={margin?.top}>{children}</div>
  ),
  Area: () => <div data-testid="chart-line" />,
  Line: () => <div data-testid="chart-air-line" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  // WeatherLane reads these hooks; under the mock they return undefined so the
  // lane renders nothing here (its real rendering is covered in
  // WeatherLane.render.test.tsx). The lane's *presence* in the tree is harmless.
  useXAxisScale: () => undefined,
  usePlotArea: () => undefined,
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

  it('renders air line and overlay pill when airHistory is provided', () => {
    const airHistory = [
      { time: '2025-07-01T12:00:00Z', value: 30 },
      { time: '2025-07-01T13:00:00Z', value: 31 },
    ];
    render(
      <TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={airHistory} />
    );
    expect(screen.getByTestId('chart-air-line')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Air' })).toBeTruthy();
  });

  it('air overlay pill starts active and toggles off on click', () => {
    const airHistory = [
      { time: '2025-07-01T12:00:00Z', value: 30 },
      { time: '2025-07-01T13:00:00Z', value: 31 },
    ];
    render(
      <TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={airHistory} />
    );
    const pill = screen.getByRole('button', { name: 'Air' });
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pill);
    expect(pill.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pill);
    expect(pill.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not render air overlay pill when airHistory is empty', () => {
    render(
      <TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={[]} />
    );
    expect(screen.queryByRole('button', { name: 'Air' })).toBeNull();
  });

  it('Custom button opens the bottom sheet', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
  });

  it('Custom button toggles the bottom sheet off on second click', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clicking a quick range button closes the custom sheet', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
    fireEvent.click(screen.getByText('7D'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('DateRangePicker inside custom sheet calls onRangeChange with custom range on apply', () => {
    const handleChange = vi.fn();
    render(<TempChart data={sampleData} range="24h" onRangeChange={handleChange} loading={false} />);
    fireEvent.click(screen.getByText('Custom'));

    // Navigate to previous month so multiple past days are available
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

    // Pick two past days: first non-disabled day-number button, then one 5 days later
    const allDayButtons = screen.getAllByRole('button').filter(
      (b) => !b.hasAttribute('disabled') && /^\d+$/.test((b.textContent ?? '').trim())
    );
    expect(allDayButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(allDayButtons[0]);
    fireEvent.click(allDayButtons[Math.min(4, allDayButtons.length - 1)]);

    const applyBtn = screen.getByRole('button', { name: /apply/i });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);

    expect(handleChange).toHaveBeenCalledWith(expect.stringMatching(/^custom:/));
  });

  it('merges air-only timestamps into chartData (airHistory points at unique times appear in chart)', () => {
    // Air point at a time that has no matching pool point — exercises the poolMap.set branch
    const uniqueAirHistory = [
      { time: '2025-07-01T11:30:00Z', value: 28 },
    ];
    render(
      <TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={uniqueAirHistory} />
    );
    // Chart renders without error and shows the air line
    expect(screen.getByTestId('chart-air-line')).toBeTruthy();
  });

  it('merges air timestamps that match existing pool timestamps (airValue branch)', () => {
    // Air point at the same time as a pool point — exercises the existing.airValue = airVal branch
    const overlappingAirHistory = [
      { time: '2025-07-01T12:00:00Z', value: 29 },
    ];
    render(
      <TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={overlappingAirHistory} />
    );
    expect(screen.getByTestId('chart-air-line')).toBeTruthy();
  });

  it('closing the custom bottom sheet via its close button hides the sheet', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
    // Close via the × button inside the BottomSheet
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reserves top headroom for the weather lane only when air data is present', () => {
    // The lane draws in a band above the plot, so the chart must reserve top
    // margin when (and only when) airHistory is supplied. (Lane glyph rendering
    // itself is covered against real Recharts in WeatherLane.render.test.tsx.)
    const air = [
      { time: '2025-07-01T12:00:00Z', value: 28, conditionCode: 1000, condition: 'Sunny' },
    ];
    const { rerender } = render(
      <TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} airHistory={air} />,
    );
    expect(screen.getByTestId('line-chart').getAttribute('data-margin-top')).toBe('26');

    rerender(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    expect(screen.getByTestId('line-chart').getAttribute('data-margin-top')).toBe('8');
  });

  it('closing the custom bottom sheet via overlay click hides the sheet', () => {
    render(<TempChart data={sampleData} range="24h" onRangeChange={vi.fn()} loading={false} />);
    fireEvent.click(screen.getByText('Custom'));
    expect(screen.getByRole('dialog', { name: 'Custom range' })).toBeTruthy();
    // Click the overlay backdrop to close
    fireEvent.click(screen.getByTestId('bottom-sheet-overlay'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
