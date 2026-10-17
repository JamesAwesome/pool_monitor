import { queryLatestReadingYear } from './influx.js'

// The season shown off-season: the newest year with pool data. Shared by
// /api/mode (the Season tab's opening year) and the OG card, so the link
// preview and the page it opens agree.

export interface SeasonYear { year: number; fallback: boolean }

const TTL_MS = 10 * 60 * 1000
// Stores the pending promise so simultaneous misses share one query.
let cache: { at: number; data: Promise<SeasonYear> } | null = null

/** Off-season spans New Year's, so before May the last season was last year. */
export function fallbackSeasonYear(now = new Date()): number {
  return now.getMonth() < 4 ? now.getFullYear() - 1 : now.getFullYear()
}

/** Never throws. `fallback` = no data or the lookup failed (not cached, so the next call retries). */
export function getSeasonYear(): Promise<SeasonYear> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  const entry: { at: number; data: Promise<SeasonYear> } = { at: Date.now(), data: Promise.resolve({ year: 0, fallback: true }) }
  entry.data = queryLatestReadingYear()
    .then((y): SeasonYear => (y === null ? { year: fallbackSeasonYear(), fallback: true } : { year: y, fallback: false }))
    .catch((): SeasonYear => ({ year: fallbackSeasonYear(), fallback: true }))
    .then((r) => {
      if (r.fallback && cache === entry) cache = null
      return r
    })
  cache = entry
  return entry.data
}
