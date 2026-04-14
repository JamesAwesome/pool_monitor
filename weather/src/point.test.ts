import { describe, it, expect } from 'vitest'
import fixture from './fixtures/current.json' with { type: 'json' }
import { buildWeatherPoint } from './point.js'

describe('buildWeatherPoint', () => {
  it('creates a point with correct measurement, tags, and fields', () => {
    const point = buildWeatherPoint(fixture, 'Cheltenham, PA')
    const line = point.toLineProtocol({ defaultTags: {} })!
    expect(line).toContain('weather,')
    expect(line).toContain('location=Cheltenham\\,\\ PA')
    expect(line).toContain('condition=Sunny')
    expect(line).toContain('source=weatherapi')
    expect(line).toContain('temperature_C=17.2')
    expect(line).toContain('feelslike_C=16.4')
    expect(line).toContain('humidity=48i')
    expect(line).toContain('wind_kph=10.8')
    expect(line).toContain('condition_code=1000i')
  })

  it('uses last_updated_epoch as the timestamp (nanoseconds)', () => {
    const point = buildWeatherPoint(fixture, 'Cheltenham, PA')
    const line = point.toLineProtocol({ defaultTags: {} })!
    const expectedNs = BigInt(fixture.current.last_updated_epoch) * 1_000_000_000n
    expect(line.endsWith(` ${expectedNs}`)).toBe(true)
  })
})
