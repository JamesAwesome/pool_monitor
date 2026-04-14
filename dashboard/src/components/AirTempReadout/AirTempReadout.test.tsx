import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AirTempReadout } from './AirTempReadout';

describe('AirTempReadout', () => {
  it('renders temperature and condition when data is present', () => {
    render(
      <AirTempReadout
        data={{
          temperature_C: 20,
          feelslike_C: 19,
          humidity: 50,
          condition: 'Sunny',
          location: 'Cheltenham, PA',
          timestamp: '',
        }}
        unit="F"
      />
    );
    expect(screen.getByText(/Air/i)).toBeTruthy();
    expect(screen.getByText(/68/)).toBeTruthy();
    expect(screen.getByText(/Sunny/)).toBeTruthy();
  });

  it('renders nothing when data is null', () => {
    const { container } = render(<AirTempReadout data={null} unit="F" />);
    expect(container.firstChild).toBeNull();
  });
});
