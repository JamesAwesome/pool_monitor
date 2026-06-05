import { isValidTime } from './chemistry.js';

export const EVENT_KINDS = ['chemical', 'water', 'backwash', 'note'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const CHEM_UNITS = ['oz', 'lb', 'gal'] as const;
export const WATER_UNITS = ['in', 'gal', 'min'] as const;
export const MAX_PRODUCT_LEN = 64;
export const MAX_NOTE_LEN = 500;

export type ValidatedEvent =
  | { ok: true; date: string; time: string; kind: EventKind; product?: string; amount?: number; unit?: string; note?: string }
  | { ok: false; error: string };

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
    const product = typeof b.product === 'string' ? b.product.trim() : '';
    if (!product) return { ok: false, error: 'Product is required' };
    if (product.length > MAX_PRODUCT_LEN) return { ok: false, error: 'Product is too long' };
    const amount = num(b.amount);
    if (amount === null || amount <= 0) return { ok: false, error: 'Amount must be a positive number' };
    if (typeof b.unit !== 'string' || !(CHEM_UNITS as readonly string[]).includes(b.unit)) {
      return { ok: false, error: 'Invalid unit' };
    }
    return { ok: true, date, time, kind, product, amount, unit: b.unit };
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
