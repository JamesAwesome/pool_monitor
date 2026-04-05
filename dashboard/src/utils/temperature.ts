import type { TemperatureUnit, TemperatureZone } from '../types';

export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 * 10 + 320) / 10;
}

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  if (unit === 'F') {
    return celsiusToFahrenheit(celsius).toFixed(1);
  }
  return celsius.toFixed(1);
}

export function getTemperatureColor(celsius: number): TemperatureZone {
  if (celsius >= 32.2) return 'hot';    // >= 90°F
  if (celsius >= 26.7) return 'warm';   // >= 80°F
  if (celsius >= 21.1) return 'normal'; // >= 70°F
  return 'cool';
}
