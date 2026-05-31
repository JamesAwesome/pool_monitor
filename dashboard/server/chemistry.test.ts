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

import { validateChemistryBody } from './chemistry';

describe('validateChemistryBody', () => {
  it('accepts a valid partial reading', () => {
    const r = validateChemistryBody({ date: '2026-05-29', ph: 7.7, fc: 4 });
    expect(r).toEqual({ ok: true, date: '2026-05-29', values: { ph: 7.7, fc: 4 } });
  });

  it('rejects when no chemical values are present', () => {
    const r = validateChemistryBody({ date: '2026-05-29' });
    expect(r.ok).toBe(false);
  });

  it('rejects a missing or unparseable date', () => {
    expect(validateChemistryBody({ ph: 7 }).ok).toBe(false);
    expect(validateChemistryBody({ date: 'not-a-date', ph: 7 }).ok).toBe(false);
  });

  it('rejects out-of-bounds and non-finite values', () => {
    expect(validateChemistryBody({ date: '2026-05-29', ph: 99 }).ok).toBe(false);
    expect(validateChemistryBody({ date: '2026-05-29', fc: Number.NaN }).ok).toBe(false);
  });

  it('ignores unknown keys', () => {
    const r = validateChemistryBody({ date: '2026-05-29', ph: 7, bogus: 5 });
    expect(r).toEqual({ ok: true, date: '2026-05-29', values: { ph: 7 } });
  });
});
