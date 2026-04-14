export interface WeatherCurrent {
  last_updated_epoch: number
  temp_c: number
  feelslike_c: number
  humidity: number
  wind_kph: number
  wind_degree: number
  gust_kph: number
  pressure_mb: number
  precip_mm: number
  cloud: number
  uv: number
  vis_km: number
  dewpoint_c: number
  is_day: number
  condition: {
    text: string
    code: number
  }
}

export interface WeatherResponse {
  location: { name: string }
  current: WeatherCurrent
}

export class WeatherApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'WeatherApiError'
  }
}

export interface FetchCurrentOptions {
  apiKey: string
  location: string
}

export async function fetchCurrent(opts: FetchCurrentOptions): Promise<WeatherResponse> {
  const params = new URLSearchParams({ key: opts.apiKey, q: opts.location, aqi: 'no' })
  const url = `https://api.weatherapi.com/v1/current.json?${params.toString()}`

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new WeatherApiError(`network error: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!res.ok) {
    throw new WeatherApiError(`weatherapi returned ${res.status}`, res.status)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new WeatherApiError('weatherapi returned malformed JSON')
  }

  if (!isWeatherResponse(json)) {
    throw new WeatherApiError('weatherapi response missing required fields')
  }
  return json
}

function isWeatherResponse(value: unknown): value is WeatherResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const current = v.current as Record<string, unknown> | undefined
  if (!current) return false
  return (
    typeof current.last_updated_epoch === 'number' &&
    typeof current.temp_c === 'number' &&
    typeof current.condition === 'object' &&
    current.condition !== null
  )
}
