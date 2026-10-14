export interface Config {
  weatherApiKey: string
  location: string
  intervalMs: number
  offSeason: boolean // OFF_SEASON=true: don't poll or write
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

/** true/1/yes/on (any case) → true; anything else, or unset → false. */
export function parseFlag(raw: string | undefined): boolean {
  return ['true', '1', 'yes', 'on'].includes((raw ?? '').trim().toLowerCase())
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
    offSeason: parseFlag(env.OFF_SEASON),
    influx: {
      url: required(env, 'INFLUXDB_URL'),
      token: required(env, 'INFLUXDB_TOKEN'),
      org: required(env, 'INFLUXDB_ORG'),
      bucket: required(env, 'INFLUXDB_BUCKET'),
    },
  }
}
