import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BatteryStatus } from './BatteryStatus';

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart-container">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="battery-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
}));

// Mock fetch for battery history
globalThis.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve([{ time: '2026-04-01T00:00:00Z', value: 100 }]) })
) as unknown as typeof fetch;

describe('BatteryStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([{ time: '2026-04-01T00:00:00Z', value: 100 }]) })
    );
  });

  it('shows "OK" and percentage when current is 100', () => {
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 100 }]} loading={false} />);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.getByText('29908')).toBeTruthy();
  });

  it('shows "Replace" when current is 0', () => {
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 0 }]} loading={false} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('Replace')).toBeTruthy();
  });

  it('shows "Low" when current is 30', () => {
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 30 }]} loading={false} />);
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
  });

  it('shows "--%" when loading with no data', () => {
    render(<BatteryStatus batteries={[]} loading={true} />);
    expect(screen.getByText('--%')).toBeTruthy();
  });

  it('renders nothing when no batteries and not loading', () => {
    const { container } = render(<BatteryStatus batteries={[]} loading={false} />);
    expect(container.querySelector('[data-testid="battery-badge"]')).toBeNull();
  });

  it('renders multiple batteries', () => {
    render(<BatteryStatus batteries={[
      { id: '29908', model: 'Inkbird', current: 100 },
      { id: '12345', model: 'Inkbird', current: 30 },
    ]} loading={false} />);
    const items = screen.getAllByTestId('battery-item');
    expect(items).toHaveLength(2);
  });

  it('applies ok status class for high battery', () => {
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 100 }]} loading={false} />);
    const item = screen.getByTestId('battery-item');
    expect(item.className).toContain('ok');
  });

  it('applies low status class for zero battery', () => {
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 0 }]} loading={false} />);
    const item = screen.getByTestId('battery-item');
    expect(item.className).toContain('low');
  });

  it('shows chevron on each item', () => {
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 100 }]} loading={false} />);
    expect(screen.getByText('›')).toBeTruthy();
  });

  it('opens bottom sheet when battery item is clicked', async () => {
    const user = userEvent.setup();
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 100 }]} loading={false} />);

    await user.click(screen.getByTestId('battery-item'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Battery · 29908')).toBeTruthy();
    expect(screen.getByText('Inkbird')).toBeTruthy();
  });

  it('fetches battery history when sheet opens', async () => {
    const user = userEvent.setup();
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 100 }]} loading={false} />);

    await user.click(screen.getByTestId('battery-item'));

    expect(fetch).toHaveBeenCalledWith('/api/battery/29908/history');
  });

  it('closes bottom sheet when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 100 }]} loading={false} />);

    await user.click(screen.getByTestId('battery-item'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    await user.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
