import type { SwimSession } from '../types';

/** Newest first by date+time. Non-mutating. */
export function sortedSwims(list: SwimSession[]): SwimSession[] {
  return [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

/** Total dips = people across all sessions (with dupes). */
export function totalDips(list: SwimSession[]): number {
  return list.reduce((n, s) => n + s.people.length, 0);
}

/** "Sat, May 16 · 2:00 PM" — localized date + time label for a swim. */
export function whenLabel(s: SwimSession): string {
  const d = new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = new Date(`2000-01-01T${s.time}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${d} · ${t}`;
}

/** Emoji most-recently-used first (unique), then seeded with the starter roster. */
export function recentEmoji(list: SwimSession[], seed: string[], limit = 11): string[] {
  const seen: string[] = [];
  for (const s of sortedSwims(list)) {
    for (const p of s.people) if (!seen.includes(p)) seen.push(p);
  }
  for (const p of seed) if (!seen.includes(p)) seen.push(p);
  return seen.slice(0, limit);
}

/** Ranked tally of dips per emoji, most first. */
export function leaderboard(list: SwimSession[]): { emoji: string; count: number }[] {
  const tally: Record<string, number> = {};
  for (const s of list) for (const p of s.people) tally[p] = (tally[p] ?? 0) + 1;
  return Object.entries(tally)
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);
}
