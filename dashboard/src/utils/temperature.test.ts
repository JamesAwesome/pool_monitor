import { vi } from 'vitest';
import { celsiusToFahrenheit, formatTemperature, getTemperatureColor } from './temperature';

// Suppress unused import warning — vi is imported per project convention
void vi;

describe('celsiusToFahrenheit', () => {
  it('converts 0°C to 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32.0);
  });

  it('converts 100°C to 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212.0);
  });

  it('converts 25°C to 77°F', () => {
    expect(celsiusToFahrenheit(25)).toBe(77.0);
  });

  it('converts negative temperatures', () => {
    expect(celsiusToFahrenheit(-40)).toBe(-40.0);
  });

  it('rounds to 1 decimal place', () => {
    expect(celsiusToFahrenheit(23.5)).toBe(74.3);
  });

  it('handles fractional celsius values', () => {
    expect(celsiusToFahrenheit(26.7)).toBe(80.1);
  });
});

describe('formatTemperature', () => {
  it('formats celsius without conversion', () => {
    expect(formatTemperature(25.0, 'C')).toBe('25.0');
  });

  it('formats fahrenheit with conversion', () => {
    expect(formatTemperature(25.0, 'F')).toBe('77.0');
  });

  it('always returns 1 decimal place for celsius', () => {
    expect(formatTemperature(25, 'C')).toBe('25.0');
  });

  it('always returns 1 decimal place for fahrenheit', () => {
    expect(formatTemperature(0, 'F')).toBe('32.0');
  });

  it('handles negative values in celsius', () => {
    expect(formatTemperature(-5.3, 'C')).toBe('-5.3');
  });

  it('handles negative values in fahrenheit', () => {
    expect(formatTemperature(-40, 'F')).toBe('-40.0');
  });
});

describe('getTemperatureColor', () => {
  it('returns hot for >= 26.7°C', () => {
    expect(getTemperatureColor(26.7)).toBe('hot');
    expect(getTemperatureColor(30)).toBe('hot');
  });

  it('returns warm for >= 21.1°C and < 26.7°C', () => {
    expect(getTemperatureColor(21.1)).toBe('warm');
    expect(getTemperatureColor(25)).toBe('warm');
  });

  it('returns normal for >= 15.6°C and < 21.1°C', () => {
    expect(getTemperatureColor(15.6)).toBe('normal');
    expect(getTemperatureColor(18)).toBe('normal');
  });

  it('returns cool for < 15.6°C', () => {
    expect(getTemperatureColor(15.5)).toBe('cool');
    expect(getTemperatureColor(10)).toBe('cool');
    expect(getTemperatureColor(0)).toBe('cool');
  });

  it('returns cool for negative temperatures', () => {
    expect(getTemperatureColor(-5)).toBe('cool');
  });

  it('handles boundary values precisely', () => {
    expect(getTemperatureColor(26.69)).toBe('warm');
    expect(getTemperatureColor(21.09)).toBe('normal');
    expect(getTemperatureColor(15.59)).toBe('cool');
  });
});
