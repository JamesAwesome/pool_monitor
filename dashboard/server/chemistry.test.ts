// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { zonedNoonToUtc, CHEM_FIELDS } from './chemistry';

describe('zonedNoonToUtc', () => {
  it('maps a date to local noon in America/New_York (EDT, -4) → 16:00 UTC', () => {
    const d = zonedNoonToUtc('2026-05-29', 'America/New_York');
    expect(d.toISOString()).toBe('2026-05-29T16:00:00.000Z');
  });

  it('maps a date to local noon in winter (EST, -5) → 17:00 UTC', () => {
    const d = zonedNoonToUtc('2026-01-15', 'America/New_York');
    expect(d.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('maps a date to noon UTC for UTC timezone', () => {
    const d = zonedNoonToUtc('2026-05-29', 'UTC');
    expect(d.toISOString()).toBe('2026-05-29T12:00:00.000Z');
  });
});

describe('CHEM_FIELDS', () => {
  it('lists the six chemical field keys', () => {
    expect(CHEM_FIELDS).toEqual(['ph', 'fc', 'cc', 'ta', 'cya', 'ch']);
  });
});
