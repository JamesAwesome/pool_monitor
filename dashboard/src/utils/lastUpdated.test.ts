import { describe, it, expect } from 'vitest';
import { formatUpdatedAt } from './lastUpdated';

describe('formatUpdatedAt', () => {
  // Fixed reference "now": noon on 2026-06-08 local time.
  const now = new Date(2026, 5, 8, 12, 0, 0);

  it('returns null for null input', () => {
    expect(formatUpdatedAt(null, now)).toBeNull();
  });

  it('returns null for an invalid ISO string', () => {
    expect(formatUpdatedAt('not-a-date', now)).toBeNull();
  });

  it('formats a same-day reading as time only (no date part)', () => {
    // 4 hours before noon, same calendar day
    const iso = new Date(2026, 5, 8, 8, 34, 0).toISOString();
    const out = formatUpdatedAt(iso, now);
    expect(out).toMatch(/^Updated \d/);
    expect(out).not.toContain(',');
  });

  it('formats an earlier-day reading with a date part', () => {
    const iso = new Date(2026, 5, 7, 14, 34, 0).toISOString();
    const out = formatUpdatedAt(iso, now);
    expect(out).toMatch(/^Updated /);
    expect(out).toContain(', ');
  });
});
