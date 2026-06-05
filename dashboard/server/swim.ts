import { isValidTime } from './chemistry.js';

export const MAX_PEOPLE = 30;
export const MAX_PERSON_LEN = 16;

export type ValidatedSwim =
  | { ok: true; date: string; time: string; people: string[] }
  | { ok: false; error: string };

export function validateSwimBody(body: unknown): ValidatedSwim {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body must be an object' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.date !== 'string' || Number.isNaN(new Date(b.date).getTime())) {
    return { ok: false, error: 'Invalid or missing date' };
  }
  if (!isValidTime(b.time)) {
    return { ok: false, error: 'Invalid or missing time' };
  }
  if (!Array.isArray(b.people) || b.people.length === 0) {
    return { ok: false, error: 'At least one person is required' };
  }
  if (b.people.length > MAX_PEOPLE) {
    return { ok: false, error: `At most ${MAX_PEOPLE} people` };
  }

  const people: string[] = [];
  for (const raw of b.people) {
    if (typeof raw !== 'string') return { ok: false, error: 'Each person must be a string' };
    const p = raw.trim();
    if (p.length === 0) return { ok: false, error: 'Person cannot be empty' };
    if (p.length > MAX_PERSON_LEN) return { ok: false, error: 'Person is too long' };
    if (p.includes(',')) return { ok: false, error: 'Person cannot contain a comma' };
    people.push(p);
  }

  return { ok: true, date: b.date, time: b.time as string, people };
}
