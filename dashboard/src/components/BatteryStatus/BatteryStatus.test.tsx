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

    expect(fetch).toHaveBeenCalledWith('/api/battery-history?sensor=29908');
  });

  it('shows discharge rate and estimated days when history has declining data', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([
        { time: '2026-04-01T00:00:00Z', value: 67 },
        { time: '2026-04-02T00:00:00Z', value: 65 },
        { time: '2026-04-03T00:00:00Z', value: 63 },
        { time: '2026-04-04T00:00:00Z', value: 61 },
      ]) })
    );

    const user = userEvent.setup();
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 61 }]} loading={false} />);
    await user.click(screen.getByTestId('battery-item'));

    // Wait for fetch to resolve and component to re-render
    await screen.findByText(/\/day/);
    expect(screen.getByText(/remaining/)).toBeTruthy();
  });

  it('does not show discharge rate when history starts at zero (regression: gap-fill artifact)', async () => {
    // This was a real bug: createEmpty + fill(usePrevious) inserted 0% points
    // before the sensor existed, making first=0 last=60 (battery "increasing")
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([
        { time: '2026-03-29T00:00:00Z', value: 0 },
        { time: '2026-03-30T00:00:00Z', value: 0 },
        { time: '2026-04-01T00:00:00Z', value: 67 },
        { time: '2026-04-04T00:00:00Z', value: 61 },
      ]) })
    );

    const user = userEvent.setup();
    render(<BatteryStatus batteries={[{ id: '29908', model: 'Inkbird', current: 61 }]} loading={false} />);
    await user.click(screen.getByTestId('battery-item'));

    // Wait for fetch to resolve
    await screen.findByText('Inkbird');
    // Rate should NOT show because first.value (0) < last.value (61) => negative rate
    expect(screen.queryByText(/\/day/)).toBeNull();
    expect(screen.queryByText(/remaining/)).toBeNull();
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
