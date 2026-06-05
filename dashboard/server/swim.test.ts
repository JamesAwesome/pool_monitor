import { describe, it, expect } from 'vitest';
import { validateSwimBody } from './swim';

describe('validateSwimBody', () => {
  it('accepts a valid swim with one person', () => {
    const r = validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['🦦'] });
    expect(r).toEqual({ ok: true, date: '2026-05-20', time: '14:30', people: ['🦦'] });
  });

  it('accepts multiple people', () => {
    const r = validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['🦦', '🐢'] });
    expect(r.ok).toBe(true);
  });

  it('trims people entries', () => {
    const r = validateSwimBody({ date: '2026-05-20', time: '14:30', people: [' 🦦 '] });
    expect(r).toMatchObject({ ok: true, people: ['🦦'] });
  });

  it('rejects a non-object body', () => {
    expect(validateSwimBody(null)).toEqual({ ok: false, error: 'Body must be an object' });
  });

  it('rejects an invalid date', () => {
    expect(validateSwimBody({ date: 'nope', time: '14:30', people: ['🦦'] }).ok).toBe(false);
  });

  it('rejects an invalid time', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '25:00', people: ['🦦'] }).ok).toBe(false);
  });

  it('rejects an empty people array', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: [] }).ok).toBe(false);
  });

  it('rejects a non-array people', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: '🦦' }).ok).toBe(false);
  });

  it('rejects an entry containing a comma (delimiter safety)', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['a,b'] }).ok).toBe(false);
  });

  it('rejects an empty-string entry', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['🦦', ' '] }).ok).toBe(false);
  });

  it('rejects an entry longer than 16 chars', () => {
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: ['x'.repeat(17)] }).ok).toBe(false);
  });

  it('rejects more than 30 people', () => {
    const many = Array.from({ length: 31 }, () => '🦦');
    expect(validateSwimBody({ date: '2026-05-20', time: '14:30', people: many }).ok).toBe(false);
  });
});
