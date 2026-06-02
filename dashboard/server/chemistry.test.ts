// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CHEM_FIELDS } from './chemistry';

describe('CHEM_FIELDS', () => {
  it('lists the six chemical field keys', () => {
    expect(CHEM_FIELDS).toEqual(['ph', 'fc', 'cc', 'ta', 'cya', 'ch']);
  });
});

import { validateChemistryBody } from './chemistry';

describe('validateChemistryBody', () => {
  it('accepts a valid partial reading', () => {
    const r = validateChemistryBody({ date: '2026-05-29', time: '12:00', ph: 7.7, fc: 4 });
    expect(r).toEqual({ ok: true, date: '2026-05-29', time: '12:00', values: { ph: 7.7, fc: 4 } });
  });

  it('rejects when no chemical values are present', () => {
    const r = validateChemistryBody({ date: '2026-05-29', time: '12:00' });
    expect(r.ok).toBe(false);
  });

  it('rejects a missing or unparseable date', () => {
    expect(validateChemistryBody({ ph: 7 }).ok).toBe(false);
    expect(validateChemistryBody({ date: 'not-a-date', ph: 7 }).ok).toBe(false);
  });

  it('rejects out-of-bounds and non-finite values', () => {
    expect(validateChemistryBody({ date: '2026-05-29', time: '12:00', ph: 99 }).ok).toBe(false);
    expect(validateChemistryBody({ date: '2026-05-29', time: '12:00', fc: Number.NaN }).ok).toBe(false);
  });

  it('ignores unknown keys', () => {
    const r = validateChemistryBody({ date: '2026-05-29', time: '12:00', ph: 7, bogus: 5 });
    expect(r).toEqual({ ok: true, date: '2026-05-29', time: '12:00', values: { ph: 7 } });
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
  it('keeps early-morning readings on the correct calendar day (behind-UTC zone day-wrap)', () => {
    // Regression: midnight NY is the SAME calendar day, not the previous one.
    // 2026-05-20 00:00 EDT (-4) = 2026-05-20T04:00:00Z
    expect(dateTimeToUtc('2026-05-20', '00:00', 'America/New_York').toISOString())
      .toBe('2026-05-20T04:00:00.000Z');
    // 01:30 EDT = 05:30Z; winter 00:30 EST (-5) = 05:30Z (still May/Jan 15, not 14)
    expect(dateTimeToUtc('2026-05-20', '01:30', 'America/New_York').toISOString())
      .toBe('2026-05-20T05:30:00.000Z');
    expect(dateTimeToUtc('2026-01-15', '00:30', 'America/New_York').toISOString())
      .toBe('2026-01-15T05:30:00.000Z');
  });
  it('handles late-night times near the day boundary', () => {
    // 23:59 EDT = next-UTC-day 03:59Z, but the LOCAL day is still the 20th.
    const iso = dateTimeToUtc('2026-05-20', '23:59', 'America/New_York').toISOString();
    expect(iso).toBe('2026-05-21T03:59:00.000Z');
    expect(utcToZonedParts(iso, 'America/New_York')).toEqual({ date: '2026-05-20', time: '23:59' });
  });
  it('round-trips early-morning and boundary wall times (was off by 24h)', () => {
    const tz = 'America/New_York';
    for (const [d, t] of [['2026-05-20', '00:00'], ['2026-05-20', '03:30'], ['2026-01-15', '00:30'], ['2026-11-01', '01:30']] as const) {
      const iso = dateTimeToUtc(d, t, tz).toISOString();
      expect(utcToZonedParts(iso, tz)).toEqual({ date: d, time: t });
    }
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

import { isValidTime, isValidId } from './chemistry';

describe('isValidTime', () => {
  it('accepts HH:mm', () => { expect(isValidTime('07:50')).toBe(true); expect(isValidTime('23:59')).toBe(true); });
  it('rejects bad times', () => { ['7:50','24:00','12:60','','noon','12'].forEach(t => expect(isValidTime(t)).toBe(false)); });
});
describe('isValidId', () => {
  it('accepts an ISO timestamp', () => { expect(isValidId('2026-05-20T20:30:00.000Z')).toBe(true); });
  it('rejects non-ISO', () => { ['','abc','2026-05-20'].forEach(s => expect(isValidId(s)).toBe(false)); });
  it('accepts the no-millis form emitted by the GET endpoint (2026-05-20T20:30:00Z)', () => {
    // influx.ts queryChemistry returns _time without millis for some points;
    // isValidId must accept both forms.
    expect(isValidId('2026-05-20T20:30:00Z')).toBe(true);
  });
  it('rejects a regex-valid-but-impossible date (month 13, day 40) caught only by Date parsing', () => {
    // The regex accepts \d{4}-\d{2}-\d{2} which would pass '2026-13-40T00:00:00.000Z'.
    // The !Number.isNaN(new Date(id)) guard is the only thing that rejects it.
    expect(isValidId('2026-13-40T00:00:00.000Z')).toBe(false);
  });
});
describe('validateChemistryBody (with time)', () => {
  it('accepts a valid partial reading with date+time', () => {
    const r = validateChemistryBody({ date: '2026-05-20', time: '16:30', fc: 6.8 });
    expect(r).toEqual({ ok: true, date: '2026-05-20', time: '16:30', values: { fc: 6.8 } });
  });
  it('rejects a missing/invalid time', () => {
    expect(validateChemistryBody({ date: '2026-05-20', fc: 1 }).ok).toBe(false);
    expect(validateChemistryBody({ date: '2026-05-20', time: '99:99', fc: 1 }).ok).toBe(false);
  });
  it('still requires >=1 value', () => {
    expect(validateChemistryBody({ date: '2026-05-20', time: '16:30' }).ok).toBe(false);
  });
});
