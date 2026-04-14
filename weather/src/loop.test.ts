import { describe, it, expect, vi } from 'vitest'
import fixture from './fixtures/current.json' with { type: 'json' }
import { createTicker } from './loop.js'
import type { WeatherResponse } from './weatherapi.js'

function makeDeps() {
  const writes: unknown[] = []
  return {
    writes,
    deps: {
      fetchCurrent: vi.fn(async (): Promise<WeatherResponse> => fixture as WeatherResponse),
      writer: {
        write: vi.fn(async (p: unknown) => { writes.push(p) }),
        close: vi.fn(async () => {}),
      },
      log: vi.fn(),
      location: 'Cheltenham, PA',
    },
  }
}

describe('createTicker', () => {
  it('writes a point on first tick', async () => {
    const { deps, writes } = makeDeps()
    const tick = createTicker(deps)
    await tick()
    expect(writes.length).toBe(1)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('wrote'))
  })

  it('deduplicates when last_updated_epoch is unchanged', async () => {
    const { deps, writes } = makeDeps()
    const tick = createTicker(deps)
    await tick()
    await tick()
    expect(writes.length).toBe(1)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('deduped'))
  })

  it('writes again when last_updated_epoch advances', async () => {
    const { deps, writes } = makeDeps()
    const newer: WeatherResponse = {
      ...(fixture as WeatherResponse),
      current: { ...(fixture as WeatherResponse).current, last_updated_epoch: fixture.current.last_updated_epoch + 900 },
    }
    deps.fetchCurrent
      .mockResolvedValueOnce(fixture as WeatherResponse)
      .mockResolvedValueOnce(newer)
    const tick = createTicker(deps)
    await tick()
    await tick()
    expect(writes.length).toBe(2)
  })

  it('swallows fetch errors and logs them', async () => {
    const { deps, writes } = makeDeps()
    deps.fetchCurrent.mockRejectedValueOnce(new Error('boom'))
    const tick = createTicker(deps)
    await tick()
    expect(writes.length).toBe(0)
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('error'))
  })

  it('swallows writer errors and logs them', async () => {
    const { deps } = makeDeps()
    deps.writer.write.mockRejectedValueOnce(new Error('influx down'))
    const tick = createTicker(deps)
    await tick()
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('error'))
  })
})
