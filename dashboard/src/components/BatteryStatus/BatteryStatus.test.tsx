import { render, screen } from '@testing-library/react';
import { BatteryStatus } from './BatteryStatus';

describe('BatteryStatus', () => {
  it('shows "Battery OK" when current is 100', () => {
    render(<BatteryStatus data={{ current: 100, history: [] }} loading={false} />);
    expect(screen.getByText('Battery OK')).toBeTruthy();
  });

  it('shows "Battery Low" when current is 0', () => {
    render(<BatteryStatus data={{ current: 0, history: [] }} loading={false} />);
    expect(screen.getByText('Battery Low')).toBeTruthy();
  });

  it('shows "--" when loading', () => {
    render(<BatteryStatus data={null} loading={true} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('shows "--" when data is null', () => {
    render(<BatteryStatus data={null} loading={false} />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('applies ok class for battery OK', () => {
    render(<BatteryStatus data={{ current: 100, history: [] }} loading={false} />);
    const badge = screen.getByTestId('battery-badge');
    expect(badge.textContent).toBe('Battery OK');
  });

  it('applies low class for battery low', () => {
    render(<BatteryStatus data={{ current: 0, history: [] }} loading={false} />);
    const badge = screen.getByTestId('battery-badge');
    expect(badge.textContent).toBe('Battery Low');
  });
});
