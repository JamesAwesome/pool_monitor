# Weather Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an outdoor air temperature stream to the pool monitor via a new Node/TypeScript sidecar that polls weatherapi.com every 30 minutes and writes to InfluxDB, then surface air temperature on the dashboard.

**Architecture:** A new top-level `weather/` worker container joins the `standalone` and `server` Compose profiles. It has no HTTP server — it runs a `setInterval` loop, calls `current.json`, and writes a single `weather` measurement point per fetch to the existing `pool_temps` bucket. The dashboard gains two new API endpoints (`/api/weather/current`, `/api/weather/history`) and two UI touches (air readout next to current pool temp, optional air line on the chart). `scripts/setup.sh` prompts for the API key and location.

**Tech Stack:** Node 22, TypeScript 5.9, pnpm, vitest, `@influxdata/influxdb-client`, Docker Compose, React 19, recharts.

**Design doc:** `docs/superpowers/specs/2026-04-14-weather-sidecar-design.md`

---

## File Structure

**New files (sidecar):**
- `weather/package.json` — pnpm workspace for the worker
- `weather/pnpm-lock.yaml` — generated
- `weather/tsconfig.json`
- `weather/Dockerfile` — multi-stage, modeled on `dashboard/Dockerfile`
- `weather/.dockerignore`
- `weather/vitest.config.ts`
- `weather/src/config.ts` — env parsing + validation
- `weather/src/weatherapi.ts` — HTTP client + response typing
- `weather/src/influx.ts` — thin wrapper around `@influxdata/influxdb-client` write API
- `weather/src/point.ts` — map weatherapi response → Influx Point
- `weather/src/loop.ts` — the tick function (fetch → dedup → write) and loop orchestration
- `weather/src/index.ts` — entry point: load config, start loop
- `weather/src/weatherapi.test.ts`
- `weather/src/point.test.ts`
- `weather/src/loop.test.ts`
- `weather/src/config.test.ts`
- `weather/src/fixtures/current.json` — real sample response from weatherapi

**New files (dashboard):**
- `dashboard/src/components/AirTempReadout/AirTempReadout.tsx`
- `dashboard/src/components/AirTempReadout/AirTempReadout.module.css`
- `dashboard/src/components/AirTempReadout/AirTempReadout.test.tsx`

**Modified files:**
- `docker-compose.yml` — new `weather` service
- `.env.example` — add `WEATHERAPI_KEY`, `WEATHER_LOCATION`
- `scripts/setup.sh` — prompt for weather config
- `scripts/start.sh` — skip weather service when key is empty
- `scripts/verify.sh` — verify weather data freshness
- `dashboard/server/influx.ts` — `queryWeatherCurrent()`, `queryWeatherHistory()`
- `dashboard/server/influx.test.ts` — tests for the two new helpers
- `dashboard/server/routes.ts` — two new routes
- `dashboard/src/api/client.ts` (or wherever fetch helpers live — confirm) — `getWeatherCurrent()`, `getWeatherHistory()`
- `dashboard/src/components/CurrentTemp/CurrentTemp.tsx` — render `<AirTempReadout>`
- `dashboard/src/components/TempChart/TempChart.tsx` — optional air line overlay
- `dashboard/src/styles/tokens.css` — add `--color-air-temp`
- `dashboard/src/App.tsx` (or top-level data fetcher) — fetch weather current + history alongside existing data
- `CLAUDE.md` — document the new service, env vars, endpoints
- `docs/deployment.md` — optional weather sidecar section

---

## Task 1: Scaffold the weather worker package

**Files:**
- Create: `weather/package.json`
- Create: `weather/tsconfig.json`
- Create: `weather/vitest.config.ts`
- Create: `weather/.dockerignore`
- Create: `weather/src/index.ts` (stub)

- [ ] **Step 1: Create `weather/package.json`**

```json
{
  "name": "pool-monitor-weather",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@influxdata/influxdb-client": "^1.35.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.9.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `weather/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create `weather/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `weather/.dockerignore`**

```
node_modules
dist
coverage
*.log
.env
```

- [ ] **Step 5: Create stub `weather/src/index.ts`**

```ts
console.log('weather worker starting')
```

- [ ] **Step 6: Install dependencies**

Run: `cd weather && pnpm install`
Expected: lockfile created, no errors.

- [ ] **Step 7: Verify build and test**

Run: `cd weather && pnpm typecheck && pnpm test`
Expected: typecheck passes, vitest reports "No test files found" (that's fine at this stage — exit code 1 is OK here; skip this verification if vitest errors).

- [ ] **Step 8: Commit**

```bash
git add weather/
git commit -m "Scaffold weather worker package"
```

---

## Task 2: Config loader with env validation

**Files:**
- Create: `weather/src/config.ts`
- Create: `weather/src/config.test.ts`

- [ ] **Step 1: Write the failing test**

`weather/src/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd weather && pnpm test config`
Expected: FAIL — `loadConfig` not defined.

- [ ] **Step 3: Implement `weather/src/config.ts`**

```ts
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd weather && pnpm test config`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add weather/src/config.ts weather/src/config.test.ts
git commit -m "Add weather worker config loader"
```

---

## Task 3: weatherapi.com HTTP client

**Files:**
- Create: `weather/src/fixtures/current.json`
- Create: `weather/src/weatherapi.ts`
- Create: `weather/src/weatherapi.test.ts`

- [ ] **Step 1: Create sample fixture `weather/src/fixtures/current.json`**

```json
{
  "location": {
    "name": "Cheltenham",
    "region": "Pennsylvania",
    "country": "United States of America",
    "localtime_epoch": 1744641600
  },
  "current": {
    "last_updated_epoch": 1744641300,
    "last_updated": "2026-04-14 12:15",
    "temp_c": 17.2,
    "temp_f": 63.0,
    "is_day": 1,
    "condition": {
      "text": "Sunny",
      "code": 1000
    },
    "wind_kph": 10.8,
    "wind_degree": 210,
    "pressure_mb": 1015.0,
    "precip_mm": 0.0,
    "humidity": 48,
    "cloud": 5,
    "feelslike_c": 16.4,
    "vis_km": 16.0,
    "uv": 4.0,
    "gust_kph": 15.6,
    "dewpoint_c": 6.3
  }
}
```

- [ ] **Step 2: Write the failing test**

`weather/src/weatherapi.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd weather && pnpm test weatherapi`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `weather/src/weatherapi.ts`**

```ts
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
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd weather && pnpm test weatherapi`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add weather/src/weatherapi.ts weather/src/weatherapi.test.ts weather/src/fixtures/current.json
git commit -m "Add weatherapi.com client"
```

---

## Task 4: Map response to Influx Point

**Files:**
- Create: `weather/src/point.ts`
- Create: `weather/src/point.test.ts`

- [ ] **Step 1: Write the failing test**

`weather/src/point.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd weather && pnpm test point`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `weather/src/point.ts`**

```ts
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd weather && pnpm test point`
Expected: PASS (2 tests). If the `toLineProtocol` timestamp precision differs, adjust the assertion — the InfluxDB JS client defaults to ns precision but may emit ms depending on client options; if so, use `WritePrecision.s` explicitly in the test or relax the assertion to check the epoch is present as a substring.

- [ ] **Step 5: Commit**

```bash
git add weather/src/point.ts weather/src/point.test.ts
git commit -m "Map weatherapi response to Influx point"
```

---

## Task 5: Influx write wrapper

**Files:**
- Create: `weather/src/influx.ts`

No dedicated test file — `influx.ts` is a thin wrapper that is exercised through `loop.test.ts` via a mock.

- [ ] **Step 1: Implement `weather/src/influx.ts`**

```ts
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd weather && pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add weather/src/influx.ts
git commit -m "Add InfluxDB write wrapper for weather worker"
```

---

## Task 6: Tick function with dedup

**Files:**
- Create: `weather/src/loop.ts`
- Create: `weather/src/loop.test.ts`

- [ ] **Step 1: Write the failing test**

`weather/src/loop.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd weather && pnpm test loop`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `weather/src/loop.ts`**

```ts
import type { Point } from '@influxdata/influxdb-client'
import { buildWeatherPoint } from './point.js'
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
      deps.log(`wrote: temperature_C=${res.current.temp_c} epoch=${epoch}`)
    } catch (err) {
      deps.log(`error: influx write failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd weather && pnpm test loop`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add weather/src/loop.ts weather/src/loop.test.ts
git commit -m "Add weather tick with dedup and error handling"
```

---

## Task 7: Worker entry point

**Files:**
- Modify: `weather/src/index.ts`

- [ ] **Step 1: Replace `weather/src/index.ts`**

```ts
import { loadConfig } from './config.js'
import { fetchCurrent } from './weatherapi.js'
import { createWriter } from './influx.js'
import { createTicker } from './loop.js'

async function main() {
  const cfg = loadConfig()
  const writer = createWriter(cfg.influx)

  const tick = createTicker({
    fetchCurrent: () => fetchCurrent({ apiKey: cfg.weatherApiKey, location: cfg.location }),
    writer,
    log: (msg) => console.log(`[weather] ${new Date().toISOString()} ${msg}`),
    location: cfg.location,
  })

  console.log(`[weather] starting, location="${cfg.location}", interval=${cfg.intervalMs / 60000}m`)
  await tick()
  const handle = setInterval(() => {
    void tick()
  }, cfg.intervalMs)

  const shutdown = async (signal: string) => {
    console.log(`[weather] received ${signal}, shutting down`)
    clearInterval(handle)
    await writer.close()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error(`[weather] fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
```

- [ ] **Step 2: Verify build**

Run: `cd weather && pnpm build`
Expected: `dist/index.js` produced, no errors.

- [ ] **Step 3: Commit**

```bash
git add weather/src/index.ts
git commit -m "Wire weather worker entry point"
```

---

## Task 8: Worker Dockerfile

**Files:**
- Create: `weather/Dockerfile`

- [ ] **Step 1: Create `weather/Dockerfile`**

```dockerfile
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Build the image**

Run: `docker build -t pool-monitor-weather:dev ./weather`
Expected: image builds successfully.

- [ ] **Step 3: Commit**

```bash
git add weather/Dockerfile
git commit -m "Add Dockerfile for weather worker"
```

---

## Task 9: Compose service + env example

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add `weather` service to `docker-compose.yml`**

Insert between `dashboard` and `cloudflared`:

```yaml
  weather:
    build:
      context: ./weather
    container_name: weather
    restart: unless-stopped
    profiles: ["standalone", "server"]
    environment:
      WEATHERAPI_KEY: ${WEATHERAPI_KEY}
      WEATHER_LOCATION: ${WEATHER_LOCATION:-Cheltenham, PA}
      WEATHER_INTERVAL_MINUTES: ${WEATHER_INTERVAL_MINUTES:-30}
      INFLUXDB_URL: http://influxdb:8086
      INFLUXDB_TOKEN: ${INFLUXDB_TOKEN}
      INFLUXDB_ORG: ${INFLUXDB_ORG}
      INFLUXDB_BUCKET: ${INFLUXDB_BUCKET}
    depends_on:
      influxdb:
        condition: service_healthy
```

- [ ] **Step 2: Append to `.env.example`**

```env

# --- Weather sidecar (optional) ---
# Get a free API key at https://www.weatherapi.com/
# Leave WEATHERAPI_KEY empty to disable the weather sidecar.
WEATHERAPI_KEY=
WEATHER_LOCATION=Cheltenham, PA
# WEATHER_INTERVAL_MINUTES=30
```

- [ ] **Step 3: Validate compose**

Run: `docker compose --profile standalone config > /dev/null`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "Add weather sidecar to compose and env example"
```

---

## Task 10: setup.sh prompts for weather config

**Files:**
- Modify: `scripts/setup.sh`

- [ ] **Step 1: Read the current `scripts/setup.sh`**

Open it and locate the section where `.env` values are written (after the existing prompts for InfluxDB, MQTT, Grafana, etc.). The goal is to add prompts *before* `.env` is written.

- [ ] **Step 2: Add the prompts**

Insert a new section near the end of the interactive prompts (before the `.env` write step):

```bash
echo ""
echo "--- Weather sidecar (optional) ---"
echo "Leave the API key blank to skip the weather sidecar."
read -r -p "weatherapi.com API key: " WEATHERAPI_KEY
read -r -p "Weather location [Cheltenham, PA]: " WEATHER_LOCATION
WEATHER_LOCATION=${WEATHER_LOCATION:-"Cheltenham, PA"}
```

And extend the block that writes `.env` to include:

```bash
WEATHERAPI_KEY=${WEATHERAPI_KEY}
WEATHER_LOCATION=${WEATHER_LOCATION}
```

Match whatever heredoc/echo style the rest of the script uses. If the script uses `cat <<EOF > .env`, add the two lines inside that heredoc. If it appends one line at a time, append these two at the end.

- [ ] **Step 3: If the key is blank, print a hint**

After the write block:

```bash
if [ -z "${WEATHERAPI_KEY}" ]; then
  echo "Weather sidecar disabled (no API key). Add WEATHERAPI_KEY to .env later to enable."
fi
```

- [ ] **Step 4: Shellcheck / syntax check**

Run: `bash -n scripts/setup.sh`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup.sh
git commit -m "Prompt for weather config in setup.sh"
```

---

## Task 11: start.sh skips weather service when key is empty

**Files:**
- Modify: `scripts/start.sh`

- [ ] **Step 1: Read current `scripts/start.sh` to find the `docker compose up` invocation**

- [ ] **Step 2: Before the `up` call, derive a service list**

Add near the top (after `.env` is sourced):

```bash
WEATHER_SERVICES=""
if [ -n "${WEATHERAPI_KEY:-}" ]; then
  WEATHER_SERVICES="weather"
fi
```

- [ ] **Step 3: Exclude weather from the `up` command when the key is empty**

The simplest approach: always pass the profile, but append `--scale weather=0` when disabled. Example change (adapt to your script's existing `up` invocation):

```bash
if [ -z "${WEATHERAPI_KEY:-}" ]; then
  docker compose --profile "${PROFILE}" up -d --scale weather=0
else
  docker compose --profile "${PROFILE}" up -d
fi
```

If `edge` profile is active (no `weather` service in that profile), the `--scale weather=0` flag is harmless — Docker ignores scaling for services that aren't in the selected profile.

- [ ] **Step 4: Shellcheck / syntax check**

Run: `bash -n scripts/start.sh`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/start.sh
git commit -m "Skip weather service in start.sh when API key is unset"
```

---

## Task 12: verify.sh checks weather freshness

**Files:**
- Modify: `scripts/verify.sh`

- [ ] **Step 1: Add a check block near the existing InfluxDB / container checks**

```bash
if [ -n "${WEATHERAPI_KEY:-}" ]; then
  echo -n "Checking weather container... "
  if docker ps --format '{{.Names}}' | grep -q '^weather$'; then
    echo "OK"
  else
    echo "NOT RUNNING"
  fi

  echo -n "Checking recent weather data in InfluxDB... "
  FLUX='from(bucket: "'"${INFLUXDB_BUCKET}"'") |> range(start: -2h) |> filter(fn: (r) => r._measurement == "weather") |> filter(fn: (r) => r._field == "temperature_C") |> last()'
  RESULT=$(docker exec influxdb influx query --org "${INFLUXDB_ORG}" --token "${INFLUXDB_TOKEN}" "${FLUX}" 2>/dev/null || true)
  if echo "${RESULT}" | grep -q temperature_C; then
    echo "OK"
  else
    echo "NO RECENT DATA (expected within last 2h)"
  fi
fi
```

- [ ] **Step 2: Shellcheck / syntax check**

Run: `bash -n scripts/verify.sh`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify.sh
git commit -m "Verify weather data freshness in verify.sh"
```

---

## Task 13: Dashboard InfluxDB helpers for weather

**Files:**
- Modify: `dashboard/server/influx.ts`
- Modify: `dashboard/server/influx.test.ts`

- [ ] **Step 1: Review existing `windowPeriod()` helper**

Open `dashboard/server/influx.ts` lines ~115–126 and use the same function for `queryWeatherHistory` — do not duplicate the logic.

- [ ] **Step 2: Write failing tests**

Append to `dashboard/server/influx.test.ts`:

```ts
import { queryWeatherCurrent, queryWeatherHistory } from './influx.js'
import { vi, describe, it, expect, beforeEach } from 'vitest'

describe('queryWeatherCurrent', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns latest temperature + condition', async () => {
    const collectRows = vi.fn(async () => ([{
      _time: '2026-04-14T12:15:00Z',
      temperature_C: 17.2,
      feelslike_C: 16.4,
      humidity: 48,
      condition: 'Sunny',
      location: 'Cheltenham, PA',
    }]))
    vi.spyOn(await import('./influx.js'), 'getQueryApi').mockReturnValue({ collectRows } as any)
    const result = await queryWeatherCurrent()
    expect(result).toEqual({
      temperature_C: 17.2,
      feelslike_C: 16.4,
      humidity: 48,
      condition: 'Sunny',
      location: 'Cheltenham, PA',
      timestamp: '2026-04-14T12:15:00Z',
    })
  })

  it('returns null when no rows', async () => {
    const collectRows = vi.fn(async () => [])
    vi.spyOn(await import('./influx.js'), 'getQueryApi').mockReturnValue({ collectRows } as any)
    const result = await queryWeatherCurrent()
    expect(result).toBeNull()
  })
})

describe('queryWeatherHistory', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns aggregated time-series', async () => {
    const collectRows = vi.fn(async () => ([
      { _time: '2026-04-14T12:00:00Z', _value: 17.0 },
      { _time: '2026-04-14T12:30:00Z', _value: 17.5 },
    ]))
    vi.spyOn(await import('./influx.js'), 'getQueryApi').mockReturnValue({ collectRows } as any)
    const result = await queryWeatherHistory('24h')
    expect(result).toEqual([
      { time: '2026-04-14T12:00:00Z', value: 17.0 },
      { time: '2026-04-14T12:30:00Z', value: 17.5 },
    ])
  })
})
```

Note: existing tests in `dashboard/server/influx.test.ts` already mock `getQueryApi` — reuse the same pattern they use. If the existing style differs, match it exactly rather than introducing `vi.spyOn` on the module.

- [ ] **Step 3: Run tests and verify they fail**

Run: `cd dashboard && pnpm test influx`
Expected: FAIL — `queryWeatherCurrent` / `queryWeatherHistory` not exported.

- [ ] **Step 4: Implement the helpers in `dashboard/server/influx.ts`**

Append to the end of the file:

```ts
export interface WeatherCurrent {
  temperature_C: number
  feelslike_C: number
  humidity: number
  condition: string
  location: string
  timestamp: string
}

interface WeatherCurrentRow {
  _time: string
  temperature_C: number
  feelslike_C: number
  humidity: number
  condition: string
  location: string
}

export async function queryWeatherCurrent(): Promise<WeatherCurrent | null> {
  const api = getQueryApi()
  const query = `
    from(bucket: "${bucket}")
      |> range(start: -6h)
      |> filter(fn: (r) => r._measurement == "weather")
      |> filter(fn: (r) => r._field == "temperature_C" or r._field == "feelslike_C" or r._field == "humidity")
      |> last()
      |> pivot(rowKey: ["_time", "location", "condition"], columnKey: ["_field"], valueColumn: "_value")
      |> keep(columns: ["_time", "temperature_C", "feelslike_C", "humidity", "location", "condition"])
  `
  const rows = await api.collectRows<WeatherCurrentRow>(query)
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    temperature_C: r.temperature_C,
    feelslike_C: r.feelslike_C,
    humidity: r.humidity,
    condition: r.condition,
    location: r.location,
    timestamp: r._time,
  }
}

export async function queryWeatherHistory(range: string): Promise<Array<{ time: string; value: number }>> {
  const api = getQueryApi()
  const period = windowPeriod(range)
  const query = `
    from(bucket: "${bucket}")
      |> range(${parseRange(range)})
      |> filter(fn: (r) => r._measurement == "weather")
      |> filter(fn: (r) => r._field == "temperature_C")
      |> group()
      |> aggregateWindow(every: ${period}, fn: mean, createEmpty: false)
      |> yield(name: "weather_history")
  `
  const rows = await api.collectRows<HistoryRow>(query)
  return rows.map((r) => ({ time: r._time, value: r._value }))
}
```

Note: `windowPeriod` is already defined earlier in the file (around line 115). `HistoryRow` and `parseRange` are already defined. If `windowPeriod` is not exported at its definition, leave it unexported and just call it directly — same file.

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd dashboard && pnpm test influx && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add dashboard/server/influx.ts dashboard/server/influx.test.ts
git commit -m "Add weather query helpers to dashboard server"
```

---

## Task 14: Dashboard routes

**Files:**
- Modify: `dashboard/server/routes.ts`

- [ ] **Step 1: Add imports at top of `routes.ts`**

Change the existing import line:

```ts
import { querySensors, queryStats, queryHistory, queryBatteries, queryBatteryHistory, querySeasonHistory, queryStatDetail, queryWeatherCurrent, queryWeatherHistory } from './influx.js'
```

- [ ] **Step 2: Add two routes before `router.get('/api/health', ...)`**

```ts
router.get('/api/weather/current', async (_req, res) => {
  try {
    const data = await queryWeatherCurrent()
    res.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

router.get('/api/weather/history', async (req, res) => {
  try {
    const range = typeof req.query.range === 'string' ? req.query.range : '24h'
    const history = await queryWeatherHistory(range)
    res.json(history)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})
```

- [ ] **Step 3: Typecheck and build**

Run: `cd dashboard && pnpm typecheck && pnpm build`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/server/routes.ts
git commit -m "Expose /api/weather/current and /api/weather/history"
```

---

## Task 15: Frontend API client + data fetching

**Files:**
- Modify: whatever file in `dashboard/src/` already defines fetch helpers (e.g. `src/api/client.ts`, or a hook file — identify by grepping for existing `fetch('/api/history'`)
- Modify: the top-level component that fetches dashboard data (likely `dashboard/src/App.tsx` or a hook like `useDashboardData`)

- [ ] **Step 1: Locate fetch helpers**

Run: `grep -rn "fetch('/api/" dashboard/src/ | head`
Note the file(s) where `/api/history`, `/api/stats`, etc. are called. Add the two new helpers to the same place, following the same style.

- [ ] **Step 2: Add helpers (example — adapt to existing style)**

```ts
export interface WeatherCurrent {
  temperature_C: number
  feelslike_C: number
  humidity: number
  condition: string
  location: string
  timestamp: string
}

export async function getWeatherCurrent(): Promise<WeatherCurrent | null> {
  const res = await fetch('/api/weather/current')
  if (!res.ok) throw new Error(`weather/current ${res.status}`)
  return res.json()
}

export async function getWeatherHistory(range: string): Promise<Array<{ time: string; value: number }>> {
  const res = await fetch(`/api/weather/history?range=${encodeURIComponent(range)}`)
  if (!res.ok) throw new Error(`weather/history ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: Fetch weather data alongside existing data**

In the top-level component or hook, add parallel fetch calls for `getWeatherCurrent()` and `getWeatherHistory(range)` wrapped in try/catch so a weather failure never breaks the rest of the dashboard. Store the results in state (`airCurrent`, `airHistory`). Treat any error or null result as "weather unavailable".

- [ ] **Step 4: Typecheck**

Run: `cd dashboard && pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/
git commit -m "Fetch weather data in dashboard"
```

---

## Task 16: AirTempReadout component

**Files:**
- Create: `dashboard/src/components/AirTempReadout/AirTempReadout.tsx`
- Create: `dashboard/src/components/AirTempReadout/AirTempReadout.module.css`
- Create: `dashboard/src/components/AirTempReadout/AirTempReadout.test.tsx`
- Modify: `dashboard/src/components/CurrentTemp/CurrentTemp.tsx`

- [ ] **Step 1: Write the failing test**

`dashboard/src/components/AirTempReadout/AirTempReadout.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AirTempReadout } from './AirTempReadout'

describe('AirTempReadout', () => {
  it('renders temperature and condition when data is present', () => {
    render(<AirTempReadout data={{ temperature_C: 20, feelslike_C: 19, humidity: 50, condition: 'Sunny', location: 'Cheltenham, PA', timestamp: '' }} unit="F" />)
    expect(screen.getByText(/Air/i)).toBeInTheDocument()
    expect(screen.getByText(/68/)).toBeInTheDocument()
    expect(screen.getByText(/Sunny/)).toBeInTheDocument()
  })

  it('renders nothing when data is null', () => {
    const { container } = render(<AirTempReadout data={null} unit="F" />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd dashboard && pnpm test AirTempReadout`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AirTempReadout.tsx`**

```tsx
import styles from './AirTempReadout.module.css'
import { celsiusToFahrenheit } from '../../utils/temperature'
import type { WeatherCurrent } from '../../api/client'

interface Props {
  data: WeatherCurrent | null
  unit: 'F' | 'C'
}

export function AirTempReadout({ data, unit }: Props) {
  if (!data) return null
  const value = unit === 'F' ? Math.round(celsiusToFahrenheit(data.temperature_C)) : Math.round(data.temperature_C)
  return (
    <div className={styles.readout}>
      <span className={styles.label}>Air</span>
      <span className={styles.value}>{value}°{unit}</span>
      <span className={styles.condition}>· {data.condition}</span>
    </div>
  )
}
```

Adjust the `celsiusToFahrenheit` import path to match the actual export name in `src/utils/temperature.ts`.

- [ ] **Step 4: Create `AirTempReadout.module.css`**

```css
.readout {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}
.label { font-weight: 600; }
.value { color: var(--color-text-primary); }
.condition { opacity: 0.8; }
```

- [ ] **Step 5: Render it inside `CurrentTemp`**

In `dashboard/src/components/CurrentTemp/CurrentTemp.tsx`, accept a new optional prop `airCurrent: WeatherCurrent | null` and render `<AirTempReadout data={airCurrent} unit={unit} />` below the main temperature display. Pass `airCurrent` down from wherever `CurrentTemp` is instantiated.

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd dashboard && pnpm test AirTempReadout && pnpm typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/AirTempReadout dashboard/src/components/CurrentTemp
git commit -m "Add AirTempReadout and show air temp next to pool temp"
```

---

## Task 17: Air temperature line on TempChart

**Files:**
- Modify: `dashboard/src/components/TempChart/TempChart.tsx`
- Modify: `dashboard/src/styles/tokens.css`

- [ ] **Step 1: Add a CSS token for the air temperature line**

In `dashboard/src/styles/tokens.css`, add (under `:root` and both theme overrides as appropriate):

```css
--color-air-temp: #8a8f99;
```

Add a subtly brighter variant under `[data-theme="dark"]` if the existing tokens do the same.

- [ ] **Step 2: Extend `TempChart` props**

Add `airHistory?: Array<{ time: string; value: number }>` to the component's props. When present and non-empty, render a second `<Line>` with:
- `stroke="var(--color-air-temp)"`
- `strokeDasharray="4 4"`
- `dot={false}`
- `name="Air"`

Merge the air data into the existing chart data by timestamp so recharts has a single array with both `value` (pool) and `airValue` fields, then point the two `<Line>` components at `dataKey="value"` and `dataKey="airValue"` respectively. Convert C→F to match the existing pool line (the chart already does unit conversion — reuse the same helper).

- [ ] **Step 3: Pass `airHistory` from the parent**

Wherever `<TempChart>` is used (likely `App.tsx` or a dashboard container), pass the `airHistory` state from Task 15.

- [ ] **Step 4: Manual verification**

Run: `cd dashboard && pnpm dev` (and `pnpm dev:server` in another shell).
Open the app in a browser. With real data in Influx (or mocked), confirm:
- Air temp readout appears next to the current pool temp when `/api/weather/current` returns data
- Chart shows a dashed air line
- When `/api/weather/current` returns null (e.g. bucket empty), neither UI element appears and nothing throws

Record the outcome explicitly: "verified in browser at <url>, air readout and chart line appeared/absent as expected" — or say so clearly if the environment doesn't allow browser testing.

- [ ] **Step 5: Typecheck + lint**

Run: `cd dashboard && pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/TempChart dashboard/src/styles/tokens.css dashboard/src/App.tsx
git commit -m "Overlay air temperature line on TempChart"
```

---

## Task 18: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/deployment.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the Stack list, add:

> - **weather** (`weather/`) — Node/TS sidecar, polls weatherapi.com every 30 min, writes `weather` measurement to InfluxDB

In the deployment profile table, add `weather` alongside the other storage-side services for `standalone` and `server`.

In the dashboard API endpoints list, add:
- `/api/weather/current` — latest air temperature, feels-like, humidity, condition
- `/api/weather/history?range=...` — aggregated air temperature time series

In the dashboard env-var table, add:
| `WEATHERAPI_KEY` | Yes (for weather) | weatherapi.com API key |
| `WEATHER_LOCATION` | Yes (for weather) | Location string passed to weatherapi |

- [ ] **Step 2: Update `docs/deployment.md`**

Add a short "Weather sidecar (optional)" section describing:
- Get a free API key at weatherapi.com
- Set `WEATHERAPI_KEY` and `WEATHER_LOCATION` in `.env` (or re-run `scripts/setup.sh`)
- Run `./scripts/start.sh` — the `weather` container will start automatically on the `standalone` or `server` profile
- Data appears in the dashboard within ~30 minutes of the first successful fetch

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/deployment.md
git commit -m "Document weather sidecar"
```

---

## Task 19: Full verification

- [ ] **Step 1: Run all weather worker tests and build**

Run: `cd weather && pnpm test && pnpm build`
Expected: all tests pass, `dist/index.js` exists.

- [ ] **Step 2: Run all dashboard tests, lint, typecheck, and build**

Run: `cd dashboard && pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green.

- [ ] **Step 3: Compose config validation**

Run: `docker compose --profile standalone config > /dev/null`
Expected: no errors.

- [ ] **Step 4: Optional end-to-end smoke test (if a real API key and Influx are available)**

- Put a real `WEATHERAPI_KEY` and `WEATHER_LOCATION` in `.env`
- `./scripts/start.sh`
- `docker compose logs -f weather` — expect a `wrote: temperature_C=... epoch=...` line within a minute
- `./scripts/verify.sh` — expect weather checks to pass
- Open the dashboard and confirm the air temp readout and chart line
- Report each step's actual outcome, not just a generic "works"

- [ ] **Step 5: Final commit if any incidental fixes were needed**

```bash
git status
# if anything remains
git add -A
git commit -m "Final polish for weather sidecar"
```
