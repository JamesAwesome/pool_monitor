import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client'
import type { Config } from './config.js'

export interface WeatherWriter {
  write(point: Point): Promise<void>
  close(): Promise<void>
}

export function createWriter(cfg: Config['influx']): WeatherWriter {
  const client = new InfluxDB({ url: cfg.url, token: cfg.token })
  const api: WriteApi = client.getWriteApi(cfg.org, cfg.bucket, 's')
  return {
    async write(point: Point) {
      api.writePoint(point)
      await api.flush()
    },
    async close() {
      await api.close()
    },
  }
}
