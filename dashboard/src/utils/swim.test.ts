import { describe, it, expect } from 'vitest';
import { sortedSwims, totalDips, recentEmoji, leaderboard } from './swim';
import type { SwimSession } from '../types';

const s = (id: string, date: string, time: string, people: string[]): SwimSession => ({ id, date, time, people });

const data: SwimSession[] = [
  s('1', '2026-05-10', '12:00', ['🦦']),
  s('2', '2026-05-16', '14:00', ['🐢', '🦦']),
  s('3', '2026-05-16', '17:00', ['🐬']),
];

describe('sortedSwims', () => {
  it('orders newest first by date+time', () => {
    expect(sortedSwims(data).map((x) => x.id)).toEqual(['3', '2', '1']);
  });
  it('does not mutate the input', () => {
    const copy = [...data];
    sortedSwims(data);
    expect(data).toEqual(copy);
  });
});

describe('totalDips', () => {
  it('counts people across sessions (with dupes)', () => {
    expect(totalDips(data)).toBe(4);
  });
});

describe('recentEmoji', () => {
  it('lists most-recently-used first, unique, then seeds', () => {
    const out = recentEmoji(data, ['🦦', '🌊'], 5);
    expect(out[0]).toBe('🐬'); // newest session
    expect(new Set(out).size).toBe(out.length); // unique
    expect(out).toContain('🌊'); // seed appended
  });
  it('respects the limit', () => {
    expect(recentEmoji(data, ['a', 'b', 'c', 'd', 'e', 'f'], 3)).toHaveLength(3);
  });
});

describe('leaderboard', () => {
  it('tallies dips per emoji, descending', () => {
    expect(leaderboard(data)).toEqual([
      { emoji: '🦦', count: 2 },
      { emoji: '🐢', count: 1 },
      { emoji: '🐬', count: 1 },
    ]);
  });
});
