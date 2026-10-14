// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildSeasonSummary, daysBetween } from './seasonSummary'
import type { SeasonSummaryInput, TimedValue } from './seasonSummary'

const TZ = 'UTC'

function empty(): SeasonSummaryInput {
  return { year: 2026, poolHourly: [], airHourly: [], poolHigh: null, poolLow: null, conditions: [], chemistry: [], swims: [], events: [] }
}

/** Hourly points for one UTC day: value(hour). */
function day(date: string, value: (h: number) => number): TimedValue[] {
  return Array.from({ length: 24 }, (_, h) => ({ time: `${date}T${String(h).padStart(2, '0')}:00:00Z`, value: value(h) }))
}

describe('daysBetween', () => {
  it('counts whole days across month boundaries', () => {
    expect(daysBetween('2026-05-30', '2026-06-02')).toBe(3)
  })
})

describe('buildSeasonSummary — empty season', () => {
  it('returns null sections and zero counts', () => {
    const s = buildSeasonSummary(empty(), TZ)
    expect(s.pool).toBeNull()
    expect(s.air).toBeNull()
    expect(s.sky).toBeNull()
    expect(s.chemistry).toMatchObject({ tests: 0, testDays: 0, avgDaysBetween: null, longestGap: null, params: [] })
    expect(s.events.total).toBe(0)
    expect(s.events.chemical.busiestMonth).toBeNull()
    expect(s.swims).toMatchObject({ sessions: 0, dips: 0, swimmers: 0, leaderboard: [], biggestGroup: null, favoriteHour: null, coldestSwim: null })
  })
})

describe('pool + air', () => {
  // Day 1: flat 20; day 2: 25..31 (peak hour 17); day 3: flat 28; day 5 (gap): flat 30
  const input = empty()
  input.poolHourly = [
    ...day('2026-06-01', () => 20),
    ...day('2026-06-02', (h) => (h === 17 ? 31 : 25)),
    ...day('2026-06-03', () => 28),
    ...day('2026-06-05', () => 30),
  ]
  input.airHourly = day('2026-06-02', (h) => (h === 3 ? 10 : 20))
  input.poolHigh = { time: '2026-06-02T17:05:00Z', value: 31.4 }
  input.poolLow = { time: '2026-06-01T04:00:00Z', value: 19.8 }
  const s = buildSeasonSummary(input, TZ)

  it('computes daily extremes, swings, and counts', () => {
    const p = s.pool!
    expect(p.days).toBe(4)
    expect(p.firstDate).toBe('2026-06-01')
    expect(p.lastDate).toBe('2026-06-05')
    expect(p.high).toEqual({ date: '2026-06-02', value: 31.4 })
    expect(p.low).toEqual({ date: '2026-06-01', value: 19.8 })
    expect(p.hottestDay.date).toBe('2026-06-05')
    expect(p.coldestDay).toEqual({ date: '2026-06-01', value: 20 })
    expect(p.biggestSwing).toEqual({ date: '2026-06-02', value: 6 })
    expect(p.avgDailySwing).toBeCloseTo(1.5)
    expect(p.warmDays).toBe(2)       // 28 and 30
    expect(p.swimmableDays).toBe(3)  // 25.25, 28, 30
    expect(p.warmestHour).toBe(17)
  })

  it('only compares consecutive days for warm-ups and cool-downs', () => {
    const p = s.pool!
    // 06-01 -> 06-02 is +5.25; 06-03 -> 06-05 (gap) is ignored
    expect(p.biggestWarmUp!.date).toBe('2026-06-02')
    expect(p.biggestWarmUp!.value).toBeCloseTo(5.25)
    expect(p.biggestCoolDown).toBeNull()
  })

  it('finds the longest warm streak, broken by date gaps', () => {
    expect(s.pool!.longestWarmStreak).toEqual({ days: 1, start: '2026-06-03', end: '2026-06-03' })
  })

  it('summarizes air temp and the pool-vs-air gap on matched hours', () => {
    const a = s.air!
    expect(a.high).toEqual({ date: '2026-06-02', value: 20 })
    expect(a.low).toEqual({ date: '2026-06-02', value: 10 })
    // pool mean that day ≈ 25.25, air mean ≈ 19.58
    expect(a.poolMinusAir!).toBeCloseTo(25.25 - (23 * 20 + 10) / 24)
  })

  it('buckets days in the configured timezone', () => {
    const ny = buildSeasonSummary(input, 'America/New_York')
    // 00:00–03:00Z on 06-01 belong to 05-31 in New York
    expect(ny.pool!.firstDate).toBe('2026-05-31')
  })
})

describe('sky', () => {
  it('tallies the top condition, rainy days and sunny days', () => {
    const input = empty()
    input.conditions = [
      { time: '2026-07-01T12:00:00Z', label: 'Sunny' },
      { time: '2026-07-01T13:00:00Z', label: 'Sunny' },
      { time: '2026-07-01T14:00:00Z', label: 'Patchy rain nearby' },
      { time: '2026-07-02T12:00:00Z', label: 'Partly cloudy' },
      { time: '2026-07-02T13:00:00Z', label: '' },
    ]
    const sky = buildSeasonSummary(input, TZ).sky!
    expect(sky.topCondition).toEqual({ label: 'Sunny', pct: 50 })
    expect(sky.rainyDays).toBe(1)
    expect(sky.sunnyDays).toBe(1)
    expect(sky.daysObserved).toBe(2)
  })
})

describe('chemistry', () => {
  it('summarizes tests, spacing, gaps, and per-param stats', () => {
    const input = empty()
    input.chemistry = [
      { id: 'a', date: '2026-06-01', time: '09:00', ph: 7.4, fc: 3 },
      { id: 'b', date: '2026-06-01', time: '18:00', ph: 7.6 },
      { id: 'c', date: '2026-06-04', time: '09:00', ph: 7.2, ta: 90 },
      { id: 'd', date: '2026-06-11', time: '09:00', fc: 5 },
    ]
    const c = buildSeasonSummary(input, TZ).chemistry
    expect(c.tests).toBe(4)
    expect(c.testDays).toBe(3)
    expect(c.avgDaysBetween).toBe(5)
    expect(c.longestGap).toEqual({ days: 7, from: '2026-06-04', to: '2026-06-11' })
    const ph = c.params.find((p) => p.key === 'ph')!
    expect(ph).toMatchObject({ count: 3, min: 7.2, max: 7.6 })
    expect(ph.avg).toBeCloseTo(7.4)
    expect(c.params.map((p) => p.key)).toEqual(['ph', 'fc', 'ta'])
  })
})

describe('events', () => {
  it('totals products per unit, months, water and backwash cadence', () => {
    const input = empty()
    input.events = [
      { id: '1', date: '2026-06-01', time: '10:00', kind: 'chemical', items: [{ product: 'Liquid chlorine', amount: 1, unit: 'gal' }, { product: 'Muriatic acid', amount: 16, unit: 'oz' }] },
      { id: '2', date: '2026-06-03', time: '10:00', kind: 'chemical', items: [{ product: 'Liquid chlorine', amount: 0.5, unit: 'gal' }] },
      { id: '3', date: '2026-07-01', time: '10:00', kind: 'chemical', product: 'Liquid chlorine', amount: 1, unit: 'gal' },
      { id: '4', date: '2026-06-02', time: '10:00', kind: 'water', amount: 2, unit: 'in' },
      { id: '5', date: '2026-06-09', time: '10:00', kind: 'water', amount: 1, unit: 'in' },
      { id: '6', date: '2026-06-01', time: '10:00', kind: 'backwash' },
      { id: '7', date: '2026-06-15', time: '10:00', kind: 'backwash' },
      { id: '8', date: '2026-06-15', time: '11:00', kind: 'note', note: 'opened' },
    ]
    const e = buildSeasonSummary(input, TZ).events
    expect(e.total).toBe(8)
    expect(e.chemical.additions).toBe(3)
    expect(e.chemical.doses).toBe(4)
    expect(e.chemical.days).toBe(3)
    expect(e.chemical.avgDaysBetween).toBe(15)
    expect(e.chemical.products[0]).toEqual({ product: 'Liquid chlorine', unit: 'gal', total: 2.5, count: 3 })
    expect(e.chemical.busiestMonth).toEqual({ month: '2026-06', count: 2 })
    expect(e.water).toEqual({ count: 2, totals: [{ unit: 'in', total: 3 }] })
    expect(e.backwash).toEqual({ count: 2, avgDaysBetween: 14 })
    expect(e.notes).toBe(1)
  })
})

describe('swims', () => {
  const input = empty()
  input.poolHourly = [{ time: '2026-06-06T18:00:00Z', value: 22 }, { time: '2026-06-07T19:00:00Z', value: 29 }]
  input.swims = [
    { id: '2026-06-06T18:30:00.000Z', date: '2026-06-06', time: '18:30', people: ['🦦', '🐢', '🐬'] }, // Saturday
    { id: '2026-06-07T19:10:00.000Z', date: '2026-06-07', time: '19:10', people: ['🦦'] },
    { id: '2026-06-13T18:00:00.000Z', date: '2026-06-13', time: '18:00', people: ['🦦', '🐢'] },     // no temp
    { id: '2026-06-20T18:00:00.000Z', date: '2026-06-20', time: '18:00', people: [] },               // ignored
  ]
  const s = buildSeasonSummary(input, TZ).swims

  it('ranks swimmers and counts dips', () => {
    expect(s.sessions).toBe(3)
    expect(s.dips).toBe(6)
    expect(s.swimmers).toBe(3)
    expect(s.leaderboard[0]).toEqual({ emoji: '🦦', count: 3 })
  })

  it('finds groups, busy days, favorite times, and streaks', () => {
    expect(s.biggestGroup).toEqual({ size: 3, date: '2026-06-06', people: ['🦦', '🐢', '🐬'] })
    expect(s.busiestDay).toEqual({ date: '2026-06-06', dips: 3 })
    expect(s.favoriteHour).toBe(18)
    expect(s.favoriteWeekday).toBe(6)
    expect(s.first).toBe('2026-06-06')
    expect(s.last).toBe('2026-06-13')
    expect(s.longestStreak).toEqual({ days: 2, start: '2026-06-06' })
  })

  it('matches swims to the pool temp of their hour', () => {
    expect(s.coldestSwim).toMatchObject({ date: '2026-06-06', value: 22 })
    expect(s.warmestSwim).toMatchObject({ date: '2026-06-07', value: 29, people: ['🦦'] })
  })
})

describe('review fixes', () => {
  it('counts a day just over 80°F as warm (exact threshold, not 26.7°C)', () => {
    const input = empty()
    input.poolHourly = day('2026-07-01', () => 26.68) // 80.02°F
    expect(buildSeasonSummary(input, TZ).pool!.warmDays).toBe(1)
  })

  it('breaks leaderboard ties by who got there first', () => {
    const input = empty()
    input.swims = [
      { id: '2026-06-02T12:00:00.000Z', date: '2026-06-02', time: '12:00', people: ['🐢'] },
      { id: '2026-06-01T12:00:00.000Z', date: '2026-06-01', time: '12:00', people: ['🦦'] },
    ]
    expect(buildSeasonSummary(input, TZ).swims.leaderboard.map((p) => p.emoji)).toEqual(['🦦', '🐢'])
  })
})
