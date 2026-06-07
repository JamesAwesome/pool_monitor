import { describe, it, expect } from 'vitest';
import { validateEventBody } from './event';

const base = { date: '2026-05-20', time: '14:30' };

describe('validateEventBody', () => {
  it('accepts a single-item chemical event (normalized to items)', () => {
    const r = validateEventBody({ ...base, kind: 'chemical', items: [{ product: 'Liquid chlorine', amount: 48, unit: 'oz' }] });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', items: [{ product: 'Liquid chlorine', amount: 48, unit: 'oz' }] });
  });
  it('accepts multiple chemicals at one timestamp with per-line units', () => {
    const items = [
      { product: 'Liquid chlorine', amount: 48, unit: 'oz' },
      { product: 'Tri-chlor tabs (3 in)', amount: 2, unit: 'tabs' },
    ];
    const r = validateEventBody({ ...base, kind: 'chemical', items });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', items });
  });
  it('coerces a legacy single-product chemical body to a 1-item list', () => {
    const r = validateEventBody({ ...base, kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', items: [{ product: 'Cal-hypo', amount: 16, unit: 'oz' }] });
  });
  it('chemical: trims each product', () => {
    const r = validateEventBody({ ...base, kind: 'chemical', items: [{ product: '  Algaecide  ', amount: 8, unit: 'oz' }] });
    expect(r).toEqual({ ok: true, ...base, kind: 'chemical', items: [{ product: 'Algaecide', amount: 8, unit: 'oz' }] });
  });
  it('chemical: rejects empty items / bad item amount / bad unit / blank product / oversized product', () => {
    expect(validateEventBody({ ...base, kind: 'chemical', items: [] }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical' }).ok).toBe(false); // no items, no legacy product
    expect(validateEventBody({ ...base, kind: 'chemical', items: [{ product: 'x', amount: 0, unit: 'oz' }] }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', items: [{ product: 'x', amount: 1, unit: 'ml' }] }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', items: [{ product: '   ', amount: 1, unit: 'oz' }] }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'chemical', items: [{ product: 'x'.repeat(65), amount: 1, unit: 'oz' }] }).ok).toBe(false);
  });
  it('chemical: rejects one bad item inside an otherwise-valid list', () => {
    const items = [{ product: 'Liquid chlorine', amount: 48, unit: 'oz' }, { product: 'Acid', amount: -1, unit: 'oz' }];
    expect(validateEventBody({ ...base, kind: 'chemical', items }).ok).toBe(false);
  });
  it('chemical: rejects more than MAX_CHEM_ITEMS items', () => {
    const items = Array.from({ length: 11 }, () => ({ product: 'X', amount: 1, unit: 'oz' }));
    expect(validateEventBody({ ...base, kind: 'chemical', items }).ok).toBe(false);
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
  it('water: rejects amount<=0 / bad unit', () => {
    expect(validateEventBody({ ...base, kind: 'water', amount: 0, unit: 'in' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'water', amount: 1, unit: 'oz' }).ok).toBe(false);
  });
  it('note: rejects empty / oversized text', () => {
    expect(validateEventBody({ ...base, kind: 'note', note: '   ' }).ok).toBe(false);
    expect(validateEventBody({ ...base, kind: 'note', note: 'x'.repeat(501) }).ok).toBe(false);
  });
});
