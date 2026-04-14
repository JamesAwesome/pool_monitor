# Weather Sidecar — Design

## Goal

Track outdoor air temperature (and related conditions) alongside pool temperature so the dashboard can show how air temp relates to pool temp over time. Data comes from weatherapi.com via a new sidecar container on a fixed schedule.

## Architecture

A new top-level service `weather/` runs as a Docker container joining the `standalone` and `server` Compose profiles. It runs a simple polling loop that fetches the current weather from weatherapi.com and writes one point per fetch directly to InfluxDB.

- **Stack:** Node 22 + TypeScript, pnpm, vitest. Multi-stage Dockerfile modeled on `dashboard/`.
- **Client:** `@influxdata/influxdb-client` (same as `dashboard/`).
- **No HTTP server, no MQTT.** The container is a standalone worker.
- **Cadence:** 30 minutes (overridable via `WEATHER_INTERVAL_MINUTES` for tests).
- **Location:** configured string passed straight to the weatherapi `q` parameter. Default `Cheltenham, PA`.

## Data Model

Writes to the existing `pool_temps` bucket under a new measurement `weather` so existing pool-temperature queries are untouched.

- **Measurement:** `weather`
- **Tags:**
  - `location` — configured string (e.g. `Cheltenham, PA`)
  - `condition` — human-readable text from `current.condition.text` (e.g. `Sunny`)
  - `source` — constant `weatherapi`
- **Fields (all from `current.json` → `current`):**
  - `temperature_C` (float) — named to match the rtl_433 field so F/C helpers are reusable
  - `feelslike_C` (float)
  - `humidity` (int)
  - `wind_kph` (float)
  - `wind_degree` (int)
  - `gust_kph` (float)
  - `pressure_mb` (float)
  - `precip_mm` (float)
  - `cloud` (int)
  - `uv` (float)
  - `vis_km` (float)
  - `dewpoint_C` (float)
  - `is_day` (int, 0/1)
  - `condition_code` (int, from `current.condition.code`)
- **Timestamp:** `current.last_updated_epoch` (seconds) converted to nanoseconds.

## Sidecar Behavior

- **Entry point:** `weather/src/index.ts`. Validates env, runs one fetch at startup, then `setInterval` at the configured cadence.
- **Fetch:** `GET https://api.weatherapi.com/v1/current.json?key=${WEATHERAPI_KEY}&q=${WEATHER_LOCATION}&aqi=no`
- **Dedup:** track the last written `last_updated_epoch` in memory; if a new response matches, skip the write. Prevents duplicate points when the upstream station hasn't updated between ticks.
- **Error handling:**
  - Transient errors (network, non-2xx, malformed JSON, InfluxDB write failure): log a warning with the reason, skip this tick, continue the loop.
  - Fatal errors (missing `WEATHERAPI_KEY`, `WEATHER_LOCATION`, or any `INFLUXDB_*` var): log and exit non-zero so Docker's restart policy surfaces the problem.
- **Logging:** concise single-line logs per tick (`fetched`, `wrote`, `deduped`, `error: ...`).

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `WEATHERAPI_KEY` | yes | — | weatherapi.com API key |
| `WEATHER_LOCATION` | yes | `Cheltenham, PA` | Location string passed to weatherapi `q` |
| `WEATHER_INTERVAL_MINUTES` | no | `30` | Poll interval; primarily for tests |
| `INFLUXDB_URL` | yes | — | Set by compose to `http://influxdb:8086` |
| `INFLUXDB_TOKEN` | yes | — | Reused from existing config |
| `INFLUXDB_ORG` | yes | — | Reused from existing config |
| `INFLUXDB_BUCKET` | yes | — | Reused from existing config |

## Dashboard Integration

### Backend (`dashboard/server/`)

Two new endpoints in `routes.ts`, backed by helpers in `influx.ts`:

- `GET /api/weather/current` → `{ temperature_C, feelslike_C, humidity, condition, location, timestamp }`. Uses a Flux query for the latest point in the `weather` measurement.
- `GET /api/weather/history?range=<range>` → time-series of air temperature aligned to the same `aggregateWindow` table used by `/api/history` (same window sizes per range). Returns `[{ time, temperature_C }]`.

Both return `null` / `[]` (not 500) when no weather data exists, so the UI gracefully hides when the sidecar is not configured. No user-controlled Flux input; `range` is validated against the same allowlist as existing routes.

### Frontend (`dashboard/src/`)

- **Current air temp readout:** small secondary line near the current pool temp (inside `CurrentTemp` or the header area): *Air 72°F · Sunny*. Uses existing `utils/temperature.ts` for F/C conversion. Hidden if `/api/weather/current` returns null.
- **Chart overlay:** `TempChart` gets an optional second line for air temperature, fed from `/api/weather/history`. Styled as a dashed, muted line using a new `--color-air-temp` token. Legend toggle to hide/show. Hidden entirely if history is empty.
- **No changes** to stat cards, battery, season views, or sensor selector.

## Setup + Config Changes

- **`scripts/setup.sh`:** add a "Weather (optional)" section that prompts for `WEATHERAPI_KEY` and `WEATHER_LOCATION` (default `Cheltenham, PA`). If the key is left blank, write empty values and print a note that the weather sidecar will not start.
- **`.env.example`:** add `WEATHERAPI_KEY=` and `WEATHER_LOCATION=Cheltenham, PA` with a comment linking to weatherapi.com.
- **`docker-compose.yml`:** new `weather` service in `standalone` + `server` profiles with `depends_on: influxdb (service_healthy)`, `restart: unless-stopped`, env block mirroring the table above. If `WEATHERAPI_KEY` is empty the process exits fatally at startup; `scripts/start.sh` checks for a non-empty key and uses `--scale weather=0` (or simply omits it) so it isn't launched in that case.
- **`scripts/verify.sh`:** when `WEATHERAPI_KEY` is set, check that the `weather` container is running and that a `weather` point exists in Influx within the last ~2 hours.

## Testing

- **`weather/` (vitest):**
  - Response parsing: maps `current.json` JSON to a point with all fields and correct tags.
  - Dedup logic: skips writes when `last_updated_epoch` is unchanged.
  - Env validation: exits non-zero when required vars are missing.
  - Error path: HTTP 401 / malformed JSON / Influx write failure → logs warning, does not exit, next tick runs.
  - HTTP and InfluxDB client mocked.
- **Dashboard (vitest):**
  - New route tests for `/api/weather/current` and `/api/weather/history` using a mocked `QueryApi` (same pattern as existing `influx.test.ts`).
  - Component test: air temp readout renders when API returns data and is absent when it returns null.
  - `TempChart` test: renders air line when `airHistory` prop is populated, omits it when empty.

## Documentation

- Update `CLAUDE.md`:
  - Add `weather` to the stack list and profile table.
  - Document `/api/weather/current` and `/api/weather/history`.
  - Add `WEATHERAPI_KEY` and `WEATHER_LOCATION` to the env-var section.
- Add a short subsection in `docs/deployment.md` describing the optional weather sidecar and how to obtain an API key.

## Out of Scope

- Forecast endpoints — only current conditions.
- Air quality / AQI.
- Storing weather per-sensor or per-pool; a single configured location is enough.
- Historical backfill — only forward from install time.
- Multiple weather locations.
