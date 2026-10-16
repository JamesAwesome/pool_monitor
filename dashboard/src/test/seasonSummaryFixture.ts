import type { SeasonSummary } from '../types';

export function emptySummary(year = 2026): SeasonSummary {
  return {
    year,
    pool: null,
    air: null,
    sky: null,
    chemistry: { tests: 0, testDays: 0, avgDaysBetween: null, longestGap: null, params: [] },
    events: {
      total: 0,
      chemical: { additions: 0, doses: 0, days: 0, avgDaysBetween: null, products: [], busiestMonth: null },
      water: { count: 0, totals: [] },
      backwash: { count: 0, avgDaysBetween: null },
      notes: 0,
    },
    swims: {
      sessions: 0, dips: 0, swimmers: 0, leaderboard: [], biggestGroup: null, busiestDay: null,
      favoriteHour: null, favoriteWeekday: null, first: null, last: null, longestStreak: null,
      coldestSwim: null, warmestSwim: null,
    },
  };
}

export function fullSummary(): SeasonSummary {
  return {
    year: 2026,
    pool: {
      days: 120, firstDate: '2026-05-15', lastDate: '2026-09-30',
      avg: 27, high: { date: '2026-07-20', value: 32.5 }, low: { date: '2026-05-16', value: 18 },
      hottestDay: { date: '2026-07-20', value: 31 }, coldestDay: { date: '2026-05-16', value: 19 },
      avgDailySwing: 2, biggestSwing: { date: '2026-06-10', value: 5 },
      warmDays: 60, swimmableDays: 100,
      longestWarmStreak: { days: 12, start: '2026-07-10', end: '2026-07-21' },
      biggestWarmUp: { date: '2026-06-01', value: 2.5 }, biggestCoolDown: { date: '2026-08-15', value: 3 },
      warmestHour: 17, coolestHour: 7,
    },
    air: { avg: 24, high: { date: '2026-07-20', value: 36 }, low: { date: '2026-05-16', value: 8 }, poolMinusAir: 3 },
    sky: { topCondition: { label: 'Sunny', pct: 41 }, rainyDays: 22, sunnyDays: 70, daysObserved: 130 },
    chemistry: {
      tests: 30, testDays: 28, avgDaysBetween: 4.5, longestGap: { days: 12, from: '2026-08-01', to: '2026-08-13' },
      params: [{ key: 'ph', count: 30, avg: 7.45, min: 7.1, max: 7.9 }, { key: 'fc', count: 28, avg: 4.2, min: 1, max: 9 }],
    },
    events: {
      total: 60,
      chemical: {
        additions: 42, doses: 50, days: 40, avgDaysBetween: 3.2,
        products: [{ product: 'Liquid chlorine', unit: 'gal', total: 40.5, count: 38 }, { product: 'Muriatic acid', unit: 'oz', total: 96, count: 6 }],
        busiestMonth: { month: '2026-07', count: 15 },
      },
      water: { count: 5, totals: [{ unit: 'in', total: 6 }] },
      backwash: { count: 8, avgDaysBetween: 14 },
      notes: 5,
    },
    swims: {
      sessions: 40, dips: 95, swimmers: 4,
      leaderboard: [{ emoji: '🦦', count: 38 }, { emoji: '🐢', count: 30 }, { emoji: '🐬', count: 20 }, { emoji: '🦆', count: 7 }],
      biggestGroup: { size: 4, date: '2026-07-04', people: ['🦦', '🐢', '🐬', '🦆'] },
      busiestDay: { date: '2026-07-04', dips: 8 },
      favoriteHour: 15, favoriteWeekday: 6, first: '2026-05-20', last: '2026-09-21',
      longestStreak: { days: 9, start: '2026-07-01' },
      coldestSwim: { date: '2026-05-20', time: '15:00', people: ['🐢'], value: 20 },
      warmestSwim: { date: '2026-07-20', time: '16:00', people: ['🦦'], value: 32 },
    },
  };
}
