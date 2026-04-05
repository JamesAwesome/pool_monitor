import { describe, it, expect } from 'vitest';
import { celsiusToFahrenheit } from './utils';

describe('celsiusToFahrenheit (server)', () => {
  it('converts 0°C to 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32.0);
  });

  it('converts 100°C to 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212.0);
  });

  it('converts 25°C to 77°F', () => {
    expect(celsiusToFahrenheit(25)).toBe(77.0);
  });

  it('matches client-side conversion for key values', () => {
    // These values must match src/utils/temperature.ts celsiusToFahrenheit
    expect(celsiusToFahrenheit(-40)).toBe(-40.0);
    expect(celsiusToFahrenheit(26.7)).toBe(80.1);
  });
});
