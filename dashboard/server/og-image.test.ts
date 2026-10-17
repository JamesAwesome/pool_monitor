import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./influx.js', () => ({
  queryStats: vi.fn(async () => ({ current: 25 })),
  queryLatestReadingYear: vi.fn(async () => 2025),
  querySeasonSummaryData: vi.fn(async () => ({})),
}))
vi.mock('./seasonSummary.js', () => ({
  buildSeasonSummary: vi.fn(() => ({
    swims: { dips: 12, leaderboard: [{ emoji: '🦈', count: 8 }, { emoji: '🐬', count: 4 }] },
    pool: { high: { value: 31, date: '2025-07-20' } },
    events: { chemical: { doses: 3 } },
  })),
}))

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

describe('og-image', () => {
  beforeEach(() => { vi.resetModules() })

  it('getSeasonOgData uses the newest year with pool data', async () => {
    const { getSeasonOgData } = await import('./og-image')
    const data = await getSeasonOgData()
    expect(data.year).toBe(2025)
    expect(data.summary?.swims.dips).toBe(12)
  })

  it('getSeasonOgData keeps the year but drops stats when the summary query fails', async () => {
    const influx = await import('./influx.js')
    vi.mocked(influx.querySeasonSummaryData).mockRejectedValueOnce(new Error('down'))
    const { getSeasonOgData } = await import('./og-image')
    expect(await getSeasonOgData()).toEqual({ year: 2025, summary: null })
    // Failures aren't cached: the next call retries and succeeds.
    expect((await getSeasonOgData()).summary).not.toBeNull()
  })

  it('getSeasonOgData retries when the year was a fallback guess', async () => {
    const influx = await import('./influx.js')
    vi.mocked(influx.queryLatestReadingYear).mockRejectedValueOnce(new Error('down'))
    const { getSeasonOgData } = await import('./og-image')
    const first = await getSeasonOgData()
    expect(first.summary).not.toBeNull() // the summary for the guessed year still renders
    expect((await getSeasonOgData()).year).toBe(2025)
  })

  it('generateOgImage does not cache a card without stats', async () => {
    const influx = await import('./influx.js')
    vi.mocked(influx.querySeasonSummaryData).mockClear()
    vi.mocked(influx.querySeasonSummaryData).mockRejectedValueOnce(new Error('down'))
    process.env.OFF_SEASON = 'true'
    try {
      const { generateOgImage } = await import('./og-image')
      await generateOgImage()
      await generateOgImage()
      expect(influx.querySeasonSummaryData).toHaveBeenCalledTimes(2)
    } finally {
      delete process.env.OFF_SEASON
    }
  })

  it('concurrent callers share one season query', async () => {
    const influx = await import('./influx.js')
    vi.mocked(influx.querySeasonSummaryData).mockClear()
    vi.mocked(influx.queryLatestReadingYear).mockClear()
    const { getSeasonOgData } = await import('./og-image')
    await Promise.all([getSeasonOgData(), getSeasonOgData()])
    expect(influx.querySeasonSummaryData).toHaveBeenCalledTimes(1)
    expect(influx.queryLatestReadingYear).toHaveBeenCalledTimes(1)
  })

  it('renders the high-score card as a 1200x630 PNG, with or without stats', async () => {
    const { renderSeasonOgImage, getSeasonOgData } = await import('./og-image')
    for (const data of [await getSeasonOgData(), { year: 2025, summary: null }]) {
      const buf = renderSeasonOgImage(data)
      expect(buf.subarray(0, 4)).toEqual(PNG)
      expect(buf.readUInt32BE(16)).toBe(1200)
      expect(buf.readUInt32BE(20)).toBe(630)
    }
  })

  it('generateOgImage queries the season only in off-season mode', async () => {
    const influx = await import('./influx.js')
    vi.mocked(influx.querySeasonSummaryData).mockClear()
    process.env.OFF_SEASON = 'true'
    try {
      const { generateOgImage } = await import('./og-image')
      expect((await generateOgImage()).subarray(0, 4)).toEqual(PNG)
      expect(influx.querySeasonSummaryData).toHaveBeenCalledWith(2025)
    } finally {
      delete process.env.OFF_SEASON
    }
    vi.resetModules()
    vi.mocked(influx.querySeasonSummaryData).mockClear()
    const { generateOgImage } = await import('./og-image')
    await generateOgImage()
    expect(influx.querySeasonSummaryData).not.toHaveBeenCalled()
  })
})
