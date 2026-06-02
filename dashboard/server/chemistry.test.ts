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

import { dateTimeToUtc, utcToZonedParts } from './chemistry';

describe('dateTimeToUtc', () => {
  it('maps a date+time in EDT (-4) to the correct UTC instant', () => {
    // 2026-05-20 16:30 America/New_York (EDT) = 20:30 UTC
    expect(dateTimeToUtc('2026-05-20', '16:30', 'America/New_York').toISOString())
      .toBe('2026-05-20T20:30:00.000Z');
  });
  it('maps a winter date+time in EST (-5) correctly', () => {
    // 2026-01-15 08:00 EST = 13:00 UTC
    expect(dateTimeToUtc('2026-01-15', '08:00', 'America/New_York').toISOString())
      .toBe('2026-01-15T13:00:00.000Z');
  });
  it('treats UTC zone as identity', () => {
    expect(dateTimeToUtc('2026-05-20', '16:30', 'UTC').toISOString())
      .toBe('2026-05-20T16:30:00.000Z');
  });
});

describe('utcToZonedParts', () => {
  it('derives date + time back from a UTC instant (EDT)', () => {
    expect(utcToZonedParts('2026-05-20T20:30:00.000Z', 'America/New_York'))
      .toEqual({ date: '2026-05-20', time: '16:30' });
  });
  it('round-trips dateTimeToUtc', () => {
    const iso = dateTimeToUtc('2026-05-20', '07:50', 'America/New_York').toISOString();
    expect(utcToZonedParts(iso, 'America/New_York')).toEqual({ date: '2026-05-20', time: '07:50' });
  });
  it('renders a legacy noon-stored reading as 12:00', () => {
    const iso = '2026-05-29T16:00:00.000Z'; // noon EDT
    expect(utcToZonedParts(iso, 'America/New_York')).toEqual({ date: '2026-05-29', time: '12:00' });
  });
});
