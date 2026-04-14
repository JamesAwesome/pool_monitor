import { describe, it, expect, vi, beforeEach } from 'vitest'
import fixture from './fixtures/current.json' with { type: 'json' }
import { fetchCurrent, WeatherApiError } from './weatherapi.js'

describe('fetchCurrent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the weatherapi current endpoint with key, q, and aqi=no', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchCurrent({ apiKey: 'key123', location: 'Cheltenham, PA' })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('https://api.weatherapi.com/v1/current.json')
    expect(calledUrl).toContain('key=key123')
    expect(calledUrl).toContain('q=Cheltenham%2C+PA')
    expect(calledUrl).toContain('aqi=no')
    expect(result.current.temp_c).toBe(17.2)
    expect(result.current.condition.text).toBe('Sunny')
  })

  it('throws WeatherApiError on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })))
    await expect(fetchCurrent({ apiKey: 'x', location: 'y' })).rejects.toBeInstanceOf(WeatherApiError)
  })

  it('throws WeatherApiError on malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(fetchCurrent({ apiKey: 'x', location: 'y' })).rejects.toBeInstanceOf(WeatherApiError)
  })

  it('throws WeatherApiError when required fields are missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"location":{}}', { status: 200 })))
    await expect(fetchCurrent({ apiKey: 'x', location: 'y' })).rejects.toBeInstanceOf(WeatherApiError)
  })
})
