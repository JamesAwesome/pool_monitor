import { Point } from '@influxdata/influxdb-client'
import type { WeatherResponse } from './weatherapi.js'

export function buildWeatherPoint(res: WeatherResponse, location: string): Point {
  const c = res.current
  return new Point('weather')
    .tag('location', location)
    .tag('condition', c.condition.text)
    .tag('source', 'weatherapi')
    .floatField('temperature_C', c.temp_c)
    .floatField('feelslike_C', c.feelslike_c)
    .intField('humidity', c.humidity)
    .floatField('wind_kph', c.wind_kph)
    .intField('wind_degree', c.wind_degree)
    .floatField('gust_kph', c.gust_kph)
    .floatField('pressure_mb', c.pressure_mb)
    .floatField('precip_mm', c.precip_mm)
    .intField('cloud', c.cloud)
    .floatField('uv', c.uv)
    .floatField('vis_km', c.vis_km)
    .floatField('dewpoint_C', c.dewpoint_c)
    .intField('is_day', c.is_day)
    .intField('condition_code', c.condition.code)
    .timestamp(new Date(c.last_updated_epoch * 1000))
}
