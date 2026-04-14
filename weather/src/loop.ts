import type { Point } from '@influxdata/influxdb-client'
import { buildWeatherPoint, resolvedLocation } from './point.js'
import type { WeatherResponse } from './weatherapi.js'

export interface TickerDeps {
  fetchCurrent: () => Promise<WeatherResponse>
  writer: { write: (point: Point) => Promise<void>; close: () => Promise<void> }
  log: (message: string) => void
  location: string
}

export function createTicker(deps: TickerDeps): () => Promise<void> {
  let lastEpoch: number | null = null

  return async function tick() {
    let res: WeatherResponse
    try {
      res = await deps.fetchCurrent()
    } catch (err) {
      deps.log(`error: fetch failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    const epoch = res.current.last_updated_epoch
    if (lastEpoch !== null && epoch === lastEpoch) {
      deps.log(`deduped: last_updated_epoch=${epoch} unchanged`)
      return
    }

    const point = buildWeatherPoint(res, deps.location)
    try {
      await deps.writer.write(point)
      lastEpoch = epoch
      deps.log(`wrote: resolved="${resolvedLocation(res)}" temperature_C=${res.current.temp_c} epoch=${epoch}`)
    } catch (err) {
      deps.log(`error: influx write failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
