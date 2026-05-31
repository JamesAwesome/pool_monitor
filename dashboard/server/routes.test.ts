// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isValidRange } from './routes.js';

describe('isValidRange', () => {
  it('accepts "season"', () => {
    expect(isValidRange('season')).toBe(true);
  });

  it('accepts "all"', () => {
    expect(isValidRange('all')).toBe(true);
  });

  it('accepts relative ranges like 30d, 24h, 7d, 90d, 12h, 1w, 2m', () => {
    expect(isValidRange('30d')).toBe(true);
    expect(isValidRange('24h')).toBe(true);
    expect(isValidRange('7d')).toBe(true);
    expect(isValidRange('90d')).toBe(true);
    expect(isValidRange('12h')).toBe(true);
    expect(isValidRange('1w')).toBe(true);
    expect(isValidRange('2m')).toBe(true);
  });

  it('accepts valid custom ranges', () => {
    expect(isValidRange('custom:2026-01-01:2026-02-01')).toBe(true);
    expect(isValidRange('custom:2025-06-01:2025-09-30')).toBe(true);
  });

  it('rejects Flux injection attempts', () => {
    expect(isValidRange('30d) |> evil')).toBe(false);
  });

  it('rejects garbage strings', () => {
    expect(isValidRange('garbage')).toBe(false);
    expect(isValidRange('')).toBe(false);
    expect(isValidRange('30')).toBe(false);
    expect(isValidRange('d30')).toBe(false);
  });

  it('rejects malformed custom ranges', () => {
    expect(isValidRange('custom:2026-01-01')).toBe(false);
    expect(isValidRange('custom:not-a-date:2026-02-01')).toBe(false);
  });
});
