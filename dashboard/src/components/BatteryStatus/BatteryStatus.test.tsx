import { render, screen } from '@testing-library/react';
import { BatteryStatus } from './BatteryStatus';

describe('BatteryStatus', () => {
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
    expect(screen.getByText('29908')).toBeTruthy();
    expect(screen.getByText('12345')).toBeTruthy();
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
});
