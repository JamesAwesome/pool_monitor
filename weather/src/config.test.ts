import { describe, it, expect } from 'vitest'
import { loadConfig, parseFlag } from './config.js'

const baseEnv = {
  WEATHERAPI_KEY: 'abc123',
  WEATHER_LOCATION: 'Cheltenham, PA',
  INFLUXDB_URL: 'http://influxdb:8086',
  INFLUXDB_TOKEN: 'tok',
  INFLUXDB_ORG: 'org',
  INFLUXDB_BUCKET: 'pool_temps',
}

describe('loadConfig', () => {
  it('parses a fully populated env', () => {
    const cfg = loadConfig(baseEnv)
    expect(cfg.weatherApiKey).toBe('abc123')
    expect(cfg.location).toBe('Cheltenham, PA')
    expect(cfg.intervalMs).toBe(30 * 60 * 1000)
    expect(cfg.influx.url).toBe('http://influxdb:8086')
    expect(cfg.influx.bucket).toBe('pool_temps')
  })

  it('defaults offSeason to false', () => {
    expect(loadConfig(baseEnv).offSeason).toBe(false)
  })

  it('turns offSeason on from OFF_SEASON', () => {
    expect(loadConfig({ ...baseEnv, OFF_SEASON: 'true' }).offSeason).toBe(true)
    expect(loadConfig({ ...baseEnv, OFF_SEASON: 'false' }).offSeason).toBe(false)
  })

  it('honors WEATHER_INTERVAL_MINUTES override', () => {
    const cfg = loadConfig({ ...baseEnv, WEATHER_INTERVAL_MINUTES: '5' })
    expect(cfg.intervalMs).toBe(5 * 60 * 1000)
  })

  it.each([
    'WEATHERAPI_KEY',
    'WEATHER_LOCATION',
    'INFLUXDB_URL',
    'INFLUXDB_TOKEN',
    'INFLUXDB_ORG',
    'INFLUXDB_BUCKET',
  ])('throws when %s is missing', (missing) => {
    const env = { ...baseEnv } as Record<string, string>
    delete env[missing]
    expect(() => loadConfig(env)).toThrow(new RegExp(missing))
  })

  it('throws on non-numeric interval', () => {
    expect(() => loadConfig({ ...baseEnv, WEATHER_INTERVAL_MINUTES: 'fast' })).toThrow(/WEATHER_INTERVAL_MINUTES/)
  })
})

describe('parseFlag', () => {
  it.each(['true', 'TRUE', ' yes ', '1', 'on'])('treats %j as on', (v) => {
    expect(parseFlag(v)).toBe(true)
  })
  it.each([undefined, '', 'false', '0', 'no', 'off', 'nope'])('treats %j as off', (v) => {
    expect(parseFlag(v)).toBe(false)
  })
})
