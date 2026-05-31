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

/**
 * Convert a date-only string (YYYY-MM-DD) to the UTC instant that reads as
 * 12:00 noon in the given IANA timezone. Readings are logged by date only;
 * anchoring at local noon keeps them on the correct calendar day everywhere.
 *
 * Uses Intl.DateTimeFormat to determine the UTC offset, which avoids the
 * system-timezone dependency of the `new Date(toLocaleString(...))` approach.
 */
export function zonedNoonToUtc(dateStr: string, timeZone: string): Date {
  // Start with UTC noon as a reference point.
  const naiveNoon = new Date(`${dateStr}T12:00:00Z`);
  // Find what local time UTC noon maps to in the target timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(naiveNoon);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  // hour12:false can emit '24' for midnight; normalise with % 24.
  const localHour = get('hour') % 24;
  const localMin = get('minute');
  const localSec = get('second');
  // offsetSeconds = (local time of UTC noon) - noon
  // Subtracting it from UTC noon gives the UTC instant for local noon.
  const offsetSeconds = (localHour * 3600 + localMin * 60 + localSec) - 12 * 3600;
  return new Date(naiveNoon.getTime() - offsetSeconds * 1000);
}
