/**
 * Format the sensor's last-reading time as an absolute, localized label.
 * Same calendar day as `now` → "Updated 2:34 PM".
 * Earlier day → "Updated Jun 7, 2:34 PM".
 * Returns null for null/invalid input (caller renders nothing).
 *
 * `now` is injectable for deterministic tests; defaults to the real clock.
 */
export function formatUpdatedAt(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (sameDay) return `Updated ${time}`;

  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `Updated ${date}, ${time}`;
}
