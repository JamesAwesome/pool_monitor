export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 * 10 + 320) / 10
}
