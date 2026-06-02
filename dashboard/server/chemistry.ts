export const CHEM_FIELDS = ['ph', 'fc', 'cc', 'ta', 'cya', 'ch'] as const;
export type ChemField = (typeof CHEM_FIELDS)[number];

// Plausible physical bounds; values outside are rejected as input errors.
export const CHEM_BOUNDS: Record<ChemField, [number, number]> = {
  ph: [0, 14],
  fc: [0, 50],
  cc: [0, 50],
  ta: [0, 1000],
  cya: [0, 500],
  ch: [0, 2000],
};

export type ValidatedChemistry =
  | { ok: true; date: string; time: string; values: Partial<Record<ChemField, number>> }
  | { ok: false; error: string };

export function isValidTime(t: unknown): boolean {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function isValidId(id: unknown): boolean {
  return typeof id === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(id)
    && !Number.isNaN(new Date(id).getTime());
}

export function validateChemistryBody(body: unknown): ValidatedChemistry {
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

  const values: Partial<Record<ChemField, number>> = {};
  for (const field of CHEM_FIELDS) {
    const raw = b[field];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return { ok: false, error: `Invalid value for ${field}` };
    }
    const [min, max] = CHEM_BOUNDS[field];
    if (raw < min || raw > max) {
      return { ok: false, error: `${field} out of range` };
    }
    values[field] = raw;
  }

  if (Object.keys(values).length === 0) {
    return { ok: false, error: 'At least one chemical value is required' };
  }
  return { ok: true, date: b.date, time: b.time as string, values };
}

/**
 * Convert a date (YYYY-MM-DD) + time (HH:mm) in the given IANA timezone to the
 * UTC Date to store. Uses an Intl.DateTimeFormat offset derivation so it is
 * independent of the host system timezone.
 */
export function dateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  // Reference instant: treat the wall-clock as if it were UTC.
  const naive = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  // Format that instant in the target zone, then reassemble those FULL parts
  // (date + time) back into a UTC epoch. The gap between that and `naive` is the
  // zone's offset for this moment. Using the full timestamp — not just seconds
  // within the day — correctly accounts for the local date wrapping to a
  // different calendar day (e.g. early-morning hours in a behind-UTC zone).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(naive);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const localAsUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    get('hour') % 24, get('minute'), get('second'),
  );
  const offsetMs = localAsUtc - naive.getTime();
  return new Date(naive.getTime() - offsetMs);
}

/** Derive { date: 'YYYY-MM-DD', time: 'HH:mm' } from a UTC ISO instant in tz. */
export function utcToZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = (parseInt(get('hour'), 10) % 24).toString().padStart(2, '0');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}
