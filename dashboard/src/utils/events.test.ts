import { describe, it, expect } from 'vitest';
import { sortedEvents, summary, whenLabel, countByKind, chemItems } from './events';
import type { PoolEvent } from '../types';

const ev = (id: string, date: string, time: string, extra: Partial<PoolEvent>): PoolEvent =>
  ({ id, date, time, kind: 'backwash', ...extra });

const data: PoolEvent[] = [
  ev('1', '2026-05-10', '12:00', { kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' }),
  ev('2', '2026-05-16', '14:00', { kind: 'water', amount: 2, unit: 'in' }),
  ev('3', '2026-05-16', '17:00', { kind: 'backwash' }),
  ev('4', '2026-05-18', '09:00', { kind: 'note', note: 'cleaned skimmer' }),
];

describe('sortedEvents', () => {
  it('orders newest first, non-mutating', () => {
    const copy = [...data];
    expect(sortedEvents(data).map((x) => x.id)).toEqual(['4', '3', '2', '1']);
    expect(data).toEqual(copy);
  });
});
describe('chemItems', () => {
  it('returns the items list as-is when present', () => {
    const items = [{ product: 'Chlorine', amount: 48, unit: 'oz' }, { product: 'Acid', amount: 16, unit: 'oz' }];
    expect(chemItems(ev('1', '2026-05-20', '10:00', { kind: 'chemical', items }))).toEqual(items);
  });
  it('wraps a legacy product-only event into a 1-item list', () => {
    expect(chemItems(ev('2', '2026-05-20', '10:00', { kind: 'chemical', product: 'Cal-hypo', amount: 16, unit: 'oz' })))
      .toEqual([{ product: 'Cal-hypo', amount: 16, unit: 'oz' }]);
  });
  it('defaults missing legacy amount/unit to 0 and empty string', () => {
    expect(chemItems(ev('3', '2026-05-20', '10:00', { kind: 'chemical', product: 'Mystery' })))
      .toEqual([{ product: 'Mystery', amount: 0, unit: '' }]);
  });
  it('returns an empty list when there is neither items nor product', () => {
    expect(chemItems(ev('4', '2026-05-20', '10:00', { kind: 'chemical' }))).toEqual([]);
  });
});
describe('summary', () => {
  it('summarizes by kind', () => {
    expect(summary(data[0])).toBe('Cal-hypo · 16 oz');
    expect(summary(data[1])).toBe('Added water · 2 in');
    expect(summary(data[2])).toBe('Backwashed the filter');
    expect(summary(data[3])).toBe('cleaned skimmer');
  });
  it('shows a single chemical item unchanged', () => {
    const one = ev('5', '2026-05-20', '10:00', { kind: 'chemical', items: [{ product: 'Cal-hypo', amount: 16, unit: 'oz' }] });
    expect(summary(one)).toBe('Cal-hypo · 16 oz');
  });
  it('joins two chemical names', () => {
    const two = ev('6', '2026-05-20', '10:00', { kind: 'chemical', items: [{ product: 'Chlorine', amount: 48, unit: 'oz' }, { product: 'Acid', amount: 16, unit: 'oz' }] });
    expect(summary(two)).toBe('Chlorine, Acid');
  });
  it('truncates 3+ chemical names with a +N more count', () => {
    const three = ev('7', '2026-05-20', '10:00', { kind: 'chemical', items: [{ product: 'Liquid chlorine', amount: 48, unit: 'oz' }, { product: 'Muriatic acid', amount: 16, unit: 'oz' }, { product: 'Algaecide', amount: 8, unit: 'oz' }] });
    expect(summary(three)).toBe('Liquid chlorine, Muriatic acid +1 more');
  });
});
describe('countByKind', () => {
  it('counts per kind', () => {
    expect(countByKind(data)).toEqual({ chemical: 1, water: 1, backwash: 1, note: 1 });
  });
});
describe('whenLabel', () => {
  it('returns a non-empty label', () => {
    expect(whenLabel(data[0]).length).toBeGreaterThan(0);
  });
});
