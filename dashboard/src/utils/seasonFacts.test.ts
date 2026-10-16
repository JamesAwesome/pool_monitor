import { describe, it, expect } from 'vitest';
import { thresholdLabel, fmtTemp, fmtDelta, shortDate, monthName, hourLabel, weekdayName, score, num, funFacts } from './seasonFacts';
import { emptySummary, fullSummary } from '../test/seasonSummaryFixture';

describe('formatters', () => {
  it('formats absolute temps and deltas differently', () => {
    expect(fmtTemp(30, 'F')).toBe('86.0°F');
    expect(fmtTemp(30, 'C')).toBe('30.0°C');
    expect(fmtDelta(2, 'F')).toBe('3.6°F'); // no +32 on a difference
    expect(fmtDelta(2, 'C')).toBe('2.0°C');
    expect(thresholdLabel(80, 'F')).toBe('80°F');
    expect(thresholdLabel(70, 'C')).toBe('21.1°C');
  });

  it('formats dates, months, hours, weekdays', () => {
    expect(shortDate('2026-07-04')).toBe('Jul 4');
    expect(monthName('2026-07')).toBe('July');
    expect(hourLabel(0)).toBe('12 AM');
    expect(hourLabel(12)).toBe('12 PM');
    expect(hourLabel(17)).toBe('5 PM');
    expect(weekdayName(6)).toBe('Saturday');
    expect(weekdayName(9)).toBe('');
  });

  it('zero-pads scores and trims numbers', () => {
    expect(score(42)).toBe('000042');
    expect(score(7, 3)).toBe('007');
    expect(score(-1)).toBe('000000');
    expect(num(2.5)).toBe('2.5');
    expect(num(3)).toBe('3');
    expect(num(40.456, 2)).toBe('40.46');
  });
});

describe('funFacts', () => {
  it('returns nothing for an empty season', () => {
    expect(funFacts(emptySummary(), 'F')).toEqual([]);
  });

  it('covers chemicals, temps, swims and weather', () => {
    const text = funFacts(fullSummary(), 'F').map((f) => f.text).join('\n');
    expect(text).toContain('You added chemicals 42 times — about once every 3.2 days.');
    expect(text).toContain('Go-to product: Liquid chlorine — 38 doses, 40.5 gal total.');
    expect(text).toContain('Busiest chem month: July with 15 additions.');
    expect(text).toContain('swung an average of 3.6°F every day');
    expect(text).toContain('warmest around 5 PM, coolest around 7 AM');
    expect(text).toContain('12 straight days averaging 80°F+');
    expect(text).toContain('fell 5.4°F on Aug 15');
    expect(text).toContain('5.4°F warmer than the air');
    expect(text).toContain('🦦 was the swim champ with 38 dips.');
    expect(text).toContain('Bravest dip: 🐢 at 68.0°F on May 20.');
    expect(text).toContain('Favorite swim day: Saturday, usually around 3 PM.');
    expect(text).toContain('Biggest pool party: 4 swimmers');
    expect(text).toContain('tested the water 30 times');
    expect(text).toContain('12 days (Aug 1 → Aug 13)');
    expect(text).toContain('Filter backwashed 8 times, every 14 days.');
    expect(text).toContain('Topped off 5 times (6 in).');
    expect(text).toContain('70 sunny days, rain on 22');
  });

  it('says cooler when the pool trails the air, and singularizes', () => {
    const s = fullSummary();
    s.air!.poolMinusAir = -1;
    s.events.chemical = { ...s.events.chemical, additions: 1, avgDaysBetween: null };
    s.events.backwash = { count: 1, avgDaysBetween: null };
    s.sky!.sunnyDays = 1;
    const text = funFacts(s, 'C').map((f) => f.text).join('\n');
    expect(text).toContain('1.0°C cooler than the air');
    expect(text).toContain('You added chemicals 1 time.');
    expect(text).toContain('Filter backwashed 1 time.');
    expect(text).toContain('1 sunny day,');
  });
});
