import { describe, it, expect } from 'vitest';
import { validateEventBody } from './event';

const base = { date: '2026-05-20', time: '14:30' };

describe('validateEventBody', () => {
  it('accepts a chemical event', () => {
    const r = validateEventBody({ ...base, kind: 'chemical', product: 'Liquid chlorine', amount: 48, unit: 'oz' });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', product: 'Liquid chlorine', amount: 48, unit: 'oz' });
  });
  it('accepts tri-chlor tabs counted in the "tabs" unit', () => {
    const r = validateEventBody({ ...base, kind: 'chemical', product: 'Tri-chlor tabs (3 in)', amount: 2, unit: 'tabs' });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', product: 'Tri-chlor tabs (3 in)', amount: 2, unit: 'tabs' });
  });
  it('trims the product and drops fields not for the kind', () => {
    const r = validateEventBody({ ...base, kind: 'water', amount: 2, unit: 'in', product: 'ignored', note: 'ignored' });
    expect(r).toEqual({ ok: true, ...base, kind: 'water', amount: 2, unit: 'in' });
  });
  it('accepts a backwash with no payload', () => {
    expect(validateEventBody({ ...base, kind: 'backwash' })).toEqual({ ok: true, ...base, kind: 'backwash' });
  });
  it('accepts a note', () => {
    expect(validateEventBody({ ...base, kind: 'note', note: ' did a thing ' })).toEqual({ ok: true, ...base, kind: 'note', note: 'did a thing' });
  });
  it('rejects an unknown kind', () => {
    expect(validateEventBody({ ...base, kind: 'nope' }).ok).toBe(false);
  });
  it('rejects an invalid date / time', () => {
    expect(validateEventBody({ date: 'x', time: '14:30', kind: 'backwash' }).ok).toBe(false);
    expect(validateEventBody({ date: '2026-05-20', time: '99:99', kind: 'backwash' }).ok).toBe(false);
  });
  it('chemical: rejects missing product / amount<=0 / bad unit', () => {
    expect(validateEventBody({ ...base, kind: 'chemical', amount: 1, unit: 'oz' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', product: 'x', amount: 0, unit: 'oz' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', product: 'x', amount: 1, unit: 'ml' }).ok).toBe(false);
  });
  it('chemical: rejects a product longer than 64 chars', () => {
    expect(validateEventBody({ ...base, kind: 'chemical', product: 'x'.repeat(65), amount: 1, unit: 'oz' }).ok).toBe(false);
  });
  it('water: rejects amount<=0 / bad unit', () => {
    expect(validateEventBody({ ...base, kind: 'water', amount: 0, unit: 'in' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'water', amount: 1, unit: 'oz' }).ok).toBe(false);
  });
  it('note: rejects empty / oversized text', () => {
    expect(validateEventBody({ ...base, kind: 'note', note: '   ' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'note', note: 'x'.repeat(501) }).ok).toBe(false);
  });
});
