import { render, screen } from '@testing-library/react';
import { BatteryStatus } from './BatteryStatus';

describe('BatteryStatus', () => {
  it('shows "Battery OK" and percentage when current is 100', () => {
    render(<BatteryStatus data={{ current: 100, history: [] }} loading={false} />);
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('Battery OK')).toBeTruthy();
  });

  it('shows "Replace Battery" when current is 0', () => {
    render(<BatteryStatus data={{ current: 0, history: [] }} loading={false} />);
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('Replace Battery')).toBeTruthy();
  });

  it('shows "Battery Low" when current is 30', () => {
    render(<BatteryStatus data={{ current: 30, history: [] }} loading={false} />);
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByText('Battery Low')).toBeTruthy();
  });

  it('shows "--%" when loading', () => {
    render(<BatteryStatus data={null} loading={true} />);
    expect(screen.getByText('--%')).toBeTruthy();
  });

  it('shows "--%" when data is null', () => {
    render(<BatteryStatus data={null} loading={false} />);
    expect(screen.getByText('--%')).toBeTruthy();
  });

  it('applies ok status class for high battery', () => {
    render(<BatteryStatus data={{ current: 100, history: [] }} loading={false} />);
    const badge = screen.getByTestId('battery-badge');
    expect(badge.className).toContain('ok');
  });

  it('applies low status class for zero battery', () => {
    render(<BatteryStatus data={{ current: 0, history: [] }} loading={false} />);
    const badge = screen.getByTestId('battery-badge');
    expect(badge.className).toContain('low');
  });
});
