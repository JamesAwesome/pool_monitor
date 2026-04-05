import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SensorSelector } from './SensorSelector';

const sensors = [
  { id: '29908', model: 'Inkbird-ITH20R' },
  { id: '12345', model: 'Inkbird-ITH20R' },
];

describe('SensorSelector', () => {
  it('renders with single sensor', () => {
    render(
      <SensorSelector sensors={[sensors[0]]} selected={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('29908 · Inkbird-ITH20R')).toBeTruthy();
  });

  it('renders All button and sensor chips', () => {
    render(<SensorSelector sensors={sensors} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('29908 · Inkbird-ITH20R')).toBeTruthy();
    expect(screen.getByText('12345 · Inkbird-ITH20R')).toBeTruthy();
  });

  it('highlights All when selected is null', () => {
    render(<SensorSelector sensors={sensors} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('All').className).toContain('active');
  });

  it('highlights selected sensor', () => {
    render(<SensorSelector sensors={sensors} selected="29908" onSelect={vi.fn()} />);
    expect(screen.getByText('29908 · Inkbird-ITH20R').className).toContain('active');
    expect(screen.getByText('All').className).not.toContain('active');
  });

  it('calls onSelect with null when All is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SensorSelector sensors={sensors} selected="29908" onSelect={onSelect} />);
    await user.click(screen.getByText('All'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onSelect with sensor id when sensor is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SensorSelector sensors={sensors} selected={null} onSelect={onSelect} />);
    await user.click(screen.getByText('29908 · Inkbird-ITH20R'));
    expect(onSelect).toHaveBeenCalledWith('29908');
  });

  it('renders nothing with empty sensors', () => {
    const { container } = render(
      <SensorSelector sensors={[]} selected={null} onSelect={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });
});
