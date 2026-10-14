import { CHEM_FIELDS, utcToZonedParts } from './chemistry.js'
import type { ChemField } from './chemistry.js'
import type { ChemistryReading, SwimSession, PoolEvent } from './influx.js'

// Pure season-summary builder. All temperatures are °C (deltas too); the client
// converts. Inputs come from querySeasonSummaryData in influx.ts.

export interface TimedValue { time: string; value: number }
export interface ConditionLabel { time: string; label: string }

export interface SeasonSummaryInput {
  year: number
  poolHourly: TimedValue[]   // hourly mean, window start
  airHourly: TimedValue[]    // hourly mean, window start
  poolHigh: TimedValue | null // raw max reading
  poolLow: TimedValue | null  // raw min reading
  conditions: ConditionLabel[]
  chemistry: ChemistryReading[]
  swims: SwimSession[]
  events: PoolEvent[]
}

export interface DatedValue { date: string; value: number }

export interface PoolSummary {
  days: number
  firstDate: string
  lastDate: string
  avg: number
  high: DatedValue | null
  low: DatedValue | null
  hottestDay: DatedValue
  coldestDay: DatedValue
  avgDailySwing: number
  biggestSwing: DatedValue
  warmDays: number      // daily mean >= 80°F
  swimmableDays: number // daily mean >= 70°F
  longestWarmStreak: { days: number; start: string; end: string } | null
  biggestWarmUp: DatedValue | null   // day-over-day daily-mean rise
  biggestCoolDown: DatedValue | null // day-over-day daily-mean drop (positive number)
  warmestHour: number // local hour 0-23, typical daily peak
  coolestHour: number
}

export interface AirSummary {
  avg: number
  high: DatedValue
  low: DatedValue
  poolMinusAir: number | null // mean of (pool - air) over matched hours
}

export interface SkySummary {
  topCondition: { label: string; pct: number }
  rainyDays: number
  sunnyDays: number
  daysObserved: number
}

export interface ChemParamSummary { key: ChemField; count: number; avg: number; min: number; max: number }

export interface ChemistrySummary {
  tests: number
  testDays: number
  avgDaysBetween: number | null
  longestGap: { days: number; from: string; to: string } | null
  params: ChemParamSummary[]
}

export interface ProductTotal { product: string; unit: string; total: number; count: number }

export interface EventsSummary {
  total: number
  chemical: {
    additions: number   // event count
    doses: number       // individual product items
    days: number
    avgDaysBetween: number | null
    products: ProductTotal[] // most-used first
    busiestMonth: { month: string; count: number } | null // 'YYYY-MM'
  }
  water: { count: number; totals: { unit: string; total: number }[] }
  backwash: { count: number; avgDaysBetween: number | null }
  notes: number
}

export interface SwimTemp { date: string; time: string; people: string[]; value: number }

export interface SwimsSummary {
  sessions: number
  dips: number
  swimmers: number
  leaderboard: { emoji: string; count: number }[]
  biggestGroup: { size: number; date: string; people: string[] } | null
  busiestDay: { date: string; dips: number } | null
  favoriteHour: number | null
  favoriteWeekday: number | null // 0 = Sunday
  first: string | null
  last: string | null
  longestStreak: { days: number; start: string } | null
  coldestSwim: SwimTemp | null
  warmestSwim: SwimTemp | null
}

export interface SeasonSummary {
  year: number
  pool: PoolSummary | null
  air: AirSummary | null
  sky: SkySummary | null
  chemistry: ChemistrySummary
  events: EventsSummary
  swims: SwimsSummary
}

const WARM_C = 26.7     // 80°F
const SWIMMABLE_C = 21.1 // 70°F
const DAY_MS = 86400000
const HOUR_MS = 3600000

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

/** Average spacing between sorted distinct dates, or null with < 2 dates. */
function avgSpacing(dates: string[]): number | null {
  if (dates.length < 2) return null
  return daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1)
}

function distinctSorted(dates: string[]): string[] {
  return [...new Set(dates)].sort()
}

/** Index of the max value in a numeric tally, ties to the lowest key. */
function argmax(tally: Map<number, number>): number | null {
  let best: number | null = null
  let bestN = -Infinity
  for (const [k, n] of [...tally.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > bestN) { best = k; bestN = n }
  }
  return best
}

/** Longest run of consecutive dates (input sorted, distinct). */
function longestRun(dates: string[]): { days: number; start: string; end: string } | null {
  if (dates.length === 0) return null
  let best = { days: 1, start: dates[0], end: dates[0] }
  let start = dates[0]
  let len = 1
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) === 1) {
      len += 1
    } else {
      start = dates[i]
      len = 1
    }
    if (len > best.days) best = { days: len, start, end: dates[i] }
  }
  return best
}

interface DayAgg { date: string; mean: number; min: number; max: number }

function dailyAggregates(hourly: TimedValue[], timeZone: string): DayAgg[] {
  const byDate = new Map<string, number[]>()
  for (const p of hourly) {
    const { date } = utcToZonedParts(p.time, timeZone)
    const list = byDate.get(date) ?? []
    list.push(p.value)
    byDate.set(date, list)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vs]) => ({ date, mean: mean(vs), min: Math.min(...vs), max: Math.max(...vs) }))
}

function pickBy<T>(xs: T[], score: (x: T) => number): T {
  return xs.reduce((best, x) => (score(x) > score(best) ? x : best))
}

function toDated(p: TimedValue | null, timeZone: string): DatedValue | null {
  return p ? { date: utcToZonedParts(p.time, timeZone).date, value: p.value } : null
}

function buildPool(input: SeasonSummaryInput, timeZone: string): PoolSummary | null {
  const days = dailyAggregates(input.poolHourly, timeZone)
  if (days.length === 0) return null

  const hottest = pickBy(days, (d) => d.mean)
  const coldest = pickBy(days, (d) => -d.mean)
  const swingDay = pickBy(days, (d) => d.max - d.min)

  let warmUp: DatedValue | null = null
  let coolDown: DatedValue | null = null
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1].date, days[i].date) !== 1) continue
    const delta = days[i].mean - days[i - 1].mean
    if (delta > 0 && (!warmUp || delta > warmUp.value)) warmUp = { date: days[i].date, value: delta }
    if (delta < 0 && (!coolDown || -delta > coolDown.value)) coolDown = { date: days[i].date, value: -delta }
  }

  // Typical daily cycle: average the hourly means per local hour of day.
  const byHour = new Map<number, number[]>()
  for (const p of input.poolHourly) {
    const h = parseInt(utcToZonedParts(p.time, timeZone).time.slice(0, 2), 10)
    const list = byHour.get(h) ?? []
    list.push(p.value)
    byHour.set(h, list)
  }
  const hourMeans = new Map([...byHour.entries()].map(([h, vs]) => [h, mean(vs)]))
  const negHourMeans = new Map([...hourMeans.entries()].map(([h, v]) => [h, -v]))

  const warmDates = days.filter((d) => d.mean >= WARM_C).map((d) => d.date)

  return {
    days: days.length,
    firstDate: days[0].date,
    lastDate: days[days.length - 1].date,
    avg: mean(input.poolHourly.map((p) => p.value)),
    high: toDated(input.poolHigh, timeZone),
    low: toDated(input.poolLow, timeZone),
    hottestDay: { date: hottest.date, value: hottest.mean },
    coldestDay: { date: coldest.date, value: coldest.mean },
    avgDailySwing: mean(days.map((d) => d.max - d.min)),
    biggestSwing: { date: swingDay.date, value: swingDay.max - swingDay.min },
    warmDays: warmDates.length,
    swimmableDays: days.filter((d) => d.mean >= SWIMMABLE_C).length,
    longestWarmStreak: longestRun(warmDates),
    biggestWarmUp: warmUp,
    biggestCoolDown: coolDown,
    warmestHour: argmax(hourMeans)!,
    coolestHour: argmax(negHourMeans)!,
  }
}

function buildAir(input: SeasonSummaryInput, timeZone: string): AirSummary | null {
  const days = dailyAggregates(input.airHourly, timeZone)
  if (days.length === 0) return null
  const high = pickBy(days, (d) => d.max)
  const low = pickBy(days, (d) => -d.min)

  const pool = new Map(input.poolHourly.map((p) => [Date.parse(p.time), p.value]))
  const diffs: number[] = []
  for (const a of input.airHourly) {
    const pv = pool.get(Date.parse(a.time))
    if (pv !== undefined) diffs.push(pv - a.value)
  }

  return {
    avg: mean(input.airHourly.map((p) => p.value)),
    high: { date: high.date, value: high.max },
    low: { date: low.date, value: low.min },
    poolMinusAir: diffs.length ? mean(diffs) : null,
  }
}

const RAINY = /rain|drizzle|shower|thunder|storm|sleet/i
const SUNNY = /sunny|clear/i

function buildSky(input: SeasonSummaryInput, timeZone: string): SkySummary | null {
  const samples = input.conditions.filter((c) => c.label)
  if (samples.length === 0) return null
  const tally = new Map<string, number>()
  const rainy = new Set<string>()
  const byDay = new Map<string, Map<string, number>>()
  for (const s of samples) {
    tally.set(s.label, (tally.get(s.label) ?? 0) + 1)
    const { date } = utcToZonedParts(s.time, timeZone)
    if (RAINY.test(s.label)) rainy.add(date)
    const day = byDay.get(date) ?? new Map<string, number>()
    day.set(s.label, (day.get(s.label) ?? 0) + 1)
    byDay.set(date, day)
  }
  // A "sunny day" is one whose most frequent condition reads sunny/clear.
  let sunnyDays = 0
  for (const day of byDay.values()) {
    const [top] = [...day.entries()].sort((a, b) => b[1] - a[1])[0]
    if (SUNNY.test(top)) sunnyDays += 1
  }
  const [label, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    topCondition: { label, pct: Math.round((n / samples.length) * 100) },
    rainyDays: rainy.size,
    sunnyDays,
    daysObserved: byDay.size,
  }
}

function buildChemistry(readings: ChemistryReading[]): ChemistrySummary {
  const dates = distinctSorted(readings.map((r) => r.date))
  let longestGap: ChemistrySummary['longestGap'] = null
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i - 1], dates[i])
    if (!longestGap || gap > longestGap.days) longestGap = { days: gap, from: dates[i - 1], to: dates[i] }
  }
  const params: ChemParamSummary[] = []
  for (const key of CHEM_FIELDS) {
    const vs = readings.map((r) => r[key]).filter((v): v is number => typeof v === 'number')
    if (vs.length === 0) continue
    params.push({ key, count: vs.length, avg: mean(vs), min: Math.min(...vs), max: Math.max(...vs) })
  }
  return {
    tests: readings.length,
    testDays: dates.length,
    avgDaysBetween: avgSpacing(dates),
    longestGap,
    params,
  }
}

function eventItems(ev: PoolEvent): { product: string; amount: number; unit: string }[] {
  if (ev.items && ev.items.length) return ev.items
  if (ev.product) return [{ product: ev.product, amount: ev.amount ?? 0, unit: ev.unit ?? '' }]
  return []
}

function buildEvents(events: PoolEvent[]): EventsSummary {
  const chem = events.filter((e) => e.kind === 'chemical')
  const water = events.filter((e) => e.kind === 'water')
  const backwash = events.filter((e) => e.kind === 'backwash')

  const products = new Map<string, ProductTotal>()
  let doses = 0
  for (const ev of chem) {
    for (const it of eventItems(ev)) {
      doses += 1
      const k = `${it.product}\u0000${it.unit}`
      const cur = products.get(k) ?? { product: it.product, unit: it.unit, total: 0, count: 0 }
      cur.total += it.amount
      cur.count += 1
      products.set(k, cur)
    }
  }

  const months = new Map<string, number>()
  for (const ev of chem) months.set(ev.date.slice(0, 7), (months.get(ev.date.slice(0, 7)) ?? 0) + 1)
  const busiest = [...months.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

  const waterTotals = new Map<string, number>()
  for (const ev of water) {
    const unit = ev.unit ?? ''
    waterTotals.set(unit, (waterTotals.get(unit) ?? 0) + (ev.amount ?? 0))
  }

  const chemDates = distinctSorted(chem.map((e) => e.date))
  return {
    total: events.length,
    chemical: {
      additions: chem.length,
      doses,
      days: chemDates.length,
      avgDaysBetween: avgSpacing(chemDates),
      products: [...products.values()].sort((a, b) => b.count - a.count || b.total - a.total),
      busiestMonth: busiest ? { month: busiest[0], count: busiest[1] } : null,
    },
    water: {
      count: water.length,
      totals: [...waterTotals.entries()].map(([unit, total]) => ({ unit, total })),
    },
    backwash: {
      count: backwash.length,
      avgDaysBetween: avgSpacing(distinctSorted(backwash.map((e) => e.date))),
    },
    notes: events.filter((e) => e.kind === 'note').length,
  }
}

function buildSwims(input: SeasonSummaryInput): SwimsSummary {
  const swims = input.swims.filter((s) => s.people.length > 0)
  const tally = new Map<string, number>()
  for (const s of swims) for (const p of s.people) tally.set(p, (tally.get(p) ?? 0) + 1)
  const leaderboard = [...tally.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)

  const perDay = new Map<string, number>()
  const hours = new Map<number, number>()
  const weekdays = new Map<number, number>()
  for (const s of swims) {
    perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.people.length)
    const h = parseInt(s.time.slice(0, 2), 10)
    hours.set(h, (hours.get(h) ?? 0) + 1)
    const wd = new Date(`${s.date}T00:00:00Z`).getUTCDay()
    weekdays.set(wd, (weekdays.get(wd) ?? 0) + 1)
  }
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  const group = swims.length ? pickBy(swims, (s) => s.people.length) : null
  const dates = distinctSorted(swims.map((s) => s.date))
  const run = longestRun(dates)

  // Pool temp at swim time: hourly bucket containing the swim instant.
  const poolByHour = new Map(input.poolHourly.map((p) => [Date.parse(p.time), p.value]))
  const withTemp: SwimTemp[] = []
  for (const s of swims) {
    const hour = Math.floor(Date.parse(s.id) / HOUR_MS) * HOUR_MS
    const value = poolByHour.get(hour)
    if (value !== undefined) withTemp.push({ date: s.date, time: s.time, people: s.people, value })
  }

  return {
    sessions: swims.length,
    dips: swims.reduce((n, s) => n + s.people.length, 0),
    swimmers: tally.size,
    leaderboard,
    biggestGroup: group ? { size: group.people.length, date: group.date, people: group.people } : null,
    busiestDay: busiest ? { date: busiest[0], dips: busiest[1] } : null,
    favoriteHour: argmax(hours),
    favoriteWeekday: argmax(weekdays),
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    longestStreak: run ? { days: run.days, start: run.start } : null,
    coldestSwim: withTemp.length ? pickBy(withTemp, (s) => -s.value) : null,
    warmestSwim: withTemp.length ? pickBy(withTemp, (s) => s.value) : null,
  }
}

export function buildSeasonSummary(
  input: SeasonSummaryInput,
  timeZone = process.env.TIMEZONE ?? 'America/New_York',
): SeasonSummary {
  return {
    year: input.year,
    pool: buildPool(input, timeZone),
    air: buildAir(input, timeZone),
    sky: buildSky(input, timeZone),
    chemistry: buildChemistry(input.chemistry),
    events: buildEvents(input.events),
    swims: buildSwims(input),
  }
}
