import { isValidTime } from './chemistry.js';

export const EVENT_KINDS = ['chemical', 'water', 'backwash', 'note'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const CHEM_UNITS = ['oz', 'lb', 'gal', 'tabs'] as const;
export const WATER_UNITS = ['in', 'gal', 'min'] as const;
export const MAX_PRODUCT_LEN = 64;
export const MAX_NOTE_LEN = 500;

export interface ChemItem { product: string; amount: number; unit: string }
export const MAX_CHEM_ITEMS = 10;

export type ValidatedEvent =
  | { ok: true; date: string; time: string; kind: EventKind; items?: ChemItem[]; amount?: number; unit?: string; note?: string }
  | { ok: false; error: string };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function validateChemItem(raw: unknown): { item: ChemItem } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: 'Each chemical must be an object' };
  const r = raw as Record<string, unknown>;
  const product = typeof r.product === 'string' ? r.product.trim() : '';
  if (!product) return { error: 'Product is required' };
  if (product.length > MAX_PRODUCT_LEN) return { error: 'Product is too long' };
  const amount = num(r.amount);
  if (amount === null || amount <= 0) return { error: 'Amount must be a positive number' };
  if (typeof r.unit !== 'string' || !(CHEM_UNITS as readonly string[]).includes(r.unit)) {
    return { error: 'Invalid unit' };
  }
  return { item: { product, amount, unit: r.unit } };
}

export function validateEventBody(body: unknown): ValidatedEvent {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body must be an object' };
  const b = body as Record<string, unknown>;

  if (typeof b.date !== 'string' || Number.isNaN(new Date(b.date).getTime())) {
    return { ok: false, error: 'Invalid or missing date' };
  }
  if (!isValidTime(b.time)) return { ok: false, error: 'Invalid or missing time' };
  if (typeof b.kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(b.kind)) {
    return { ok: false, error: 'Invalid or missing kind' };
  }
  const kind = b.kind as EventKind;
  const date = b.date, time = b.time as string;

  if (kind === 'chemical') {
    // Accept either a new `items` array or a legacy single product/amount/unit body.
    const rawItems = Array.isArray(b.items)
      ? b.items
      : [{ product: b.product, amount: b.amount, unit: b.unit }];
    if (rawItems.length < 1) return { ok: false, error: 'At least one chemical is required' };
    if (rawItems.length > MAX_CHEM_ITEMS) return { ok: false, error: 'Too many chemicals' };
    const items: ChemItem[] = [];
    for (const raw of rawItems) {
      const v = validateChemItem(raw);
      if ('error' in v) return { ok: false, error: v.error };
      items.push(v.item);
    }
    return { ok: true, date, time, kind, items };
  }
  if (kind === 'water') {
    const amount = num(b.amount);
    if (amount === null || amount <= 0) return { ok: false, error: 'Amount must be a positive number' };
    if (typeof b.unit !== 'string' || !(WATER_UNITS as readonly string[]).includes(b.unit)) {
      return { ok: false, error: 'Invalid unit' };
    }
    return { ok: true, date, time, kind, amount, unit: b.unit };
  }
  if (kind === 'note') {
    const note = typeof b.note === 'string' ? b.note.trim() : '';
    if (!note) return { ok: false, error: 'Note text is required' };
    if (note.length > MAX_NOTE_LEN) return { ok: false, error: 'Note is too long' };
    return { ok: true, date, time, kind, note };
  }
  return { ok: true, date, time, kind: 'backwash' }; // backwash: no payload
}
