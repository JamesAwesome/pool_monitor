import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./influx.js', () => ({ queryLatestReadingYear: vi.fn(async () => 2025) }))

describe('seasonYear', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2027, 1, 15))
  })
  afterEach(() => { vi.useRealTimers() })

  it('fallbackSeasonYear rolls back to last year before May', async () => {
    const { fallbackSeasonYear } = await import('./seasonYear')
    expect(fallbackSeasonYear(new Date(2027, 0, 5))).toBe(2026)
    expect(fallbackSeasonYear(new Date(2027, 3, 30))).toBe(2026)
    expect(fallbackSeasonYear(new Date(2027, 9, 17))).toBe(2027)
  })

  it('uses the newest year with pool data and caches it', async () => {
    const influx = await import('./influx.js')
    vi.mocked(influx.queryLatestReadingYear).mockClear()
    const { getSeasonYear } = await import('./seasonYear')
    await Promise.all([getSeasonYear(), getSeasonYear()])
    expect(await getSeasonYear()).toEqual({ year: 2025, fallback: false })
    expect(influx.queryLatestReadingYear).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['throws', () => Promise.reject(new Error('down'))],
    ['finds no data', () => Promise.resolve(null)],
  ])('falls back to the last season when the lookup %s, then retries', async (_label, impl) => {
    const influx = await import('./influx.js')
    vi.mocked(influx.queryLatestReadingYear).mockImplementationOnce(impl as () => Promise<number | null>)
    const { getSeasonYear } = await import('./seasonYear')
    expect(await getSeasonYear()).toEqual({ year: 2026, fallback: true })
    expect(await getSeasonYear()).toEqual({ year: 2025, fallback: false })
  })
})
