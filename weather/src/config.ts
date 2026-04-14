export interface Config {
  weatherApiKey: string
  location: string
  intervalMs: number
  influx: {
    url: string
    token: string
    org: string
    bucket: string
  }
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const intervalRaw = env.WEATHER_INTERVAL_MINUTES ?? '30'
  const intervalMinutes = Number(intervalRaw)
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error(`WEATHER_INTERVAL_MINUTES must be a positive number (got "${intervalRaw}")`)
  }

  return {
    weatherApiKey: required(env, 'WEATHERAPI_KEY'),
    location: required(env, 'WEATHER_LOCATION'),
    intervalMs: intervalMinutes * 60 * 1000,
    influx: {
      url: required(env, 'INFLUXDB_URL'),
      token: required(env, 'INFLUXDB_TOKEN'),
      org: required(env, 'INFLUXDB_ORG'),
      bucket: required(env, 'INFLUXDB_BUCKET'),
    },
  }
}
