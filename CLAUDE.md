# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Raspberry Pi-based pool temperature monitor. An Inkbird IBS-P02R wireless thermometer transmits on 433.92 MHz, received by an RTL-SDR dongle. The data pipeline is:

```
Inkbird sensor -> 433 MHz -> RTL-SDR -> rtl_433 -> Mosquitto (MQTT) -> Telegraf -> InfluxDB 2 -> Grafana / Dashboard
```

## Stack

Everything runs as Docker containers via `docker-compose.yml`:

- **rtl_433** (`hertzg/rtl_433`) — decodes protocol 194 (Inkbird), publishes JSON to MQTT
- **Mosquitto** — MQTT broker on port 1883. Anonymous in standalone mode; password auth in edge/split mode (see `mosquitto-distributed.conf`). rtl_433 authenticates via `MQTT_USERNAME`/`MQTT_PASSWORD` env vars.
- **Telegraf** (`telegraf/telegraf.conf`) — subscribes to `rtl_433/+/events`, filters by sensor ID, writes to InfluxDB
- **InfluxDB 2** (v2.8.0) — time-series store on port 8086, Flux query language. Uses the v2 write API and Flux queries throughout (Telegraf output, Grafana datasource, dashboard JS client). InfluxDB 3.x exists but uses SQL instead of Flux and has a different write API — migrating would require rewriting all queries and reconfiguring Telegraf/Grafana. Not worth it at this scale. Note: the `aggregateWindow` `location` parameter (timezone-aligned windows) is only available in InfluxDB Cloud, not OSS 2.x.
- **Grafana** — dashboards on port 3000, provisioned datasource and dashboards from `grafana/provisioning/`
- **dashboard** (`dashboard/`) — React/Express SPA on port 8080, queries InfluxDB directly (see below)
- **weather** (`weather/`) — Node/TS sidecar, polls weatherapi.com every 30 min, writes `weather` measurement to InfluxDB
- **cloudflared** — Cloudflare Tunnel for public HTTPS access

## Common Commands

```bash
./scripts/start.sh            # Start services for configured DEPLOY_MODE
./scripts/stop.sh             # Stop services
./scripts/verify.sh           # Health check
docker compose --profile standalone up -d   # Or use profiles directly
docker compose --profile standalone down
docker compose logs -f         # Tail all logs
docker compose logs -f telegraf  # Debug a specific service
```

## Deployment Modes

The project supports three Docker Compose profiles:

| Profile | Services | Use Case |
|---------|----------|----------|
| `standalone` | All 7 services + weather | Single machine (default, e.g., Raspberry Pi) |
| `edge` | mosquitto, rtl_433 | Pi as lightweight data collector |
| `server` | telegraf, influxdb, grafana, dashboard, weather, cloudflared | Remote server for storage and dashboards |

`DEPLOY_MODE` in `.env` controls which profile the helper scripts use. The split boundary is MQTT — Telegraf on the server connects to Mosquitto on the Pi via `MQTT_HOST`.

**Off-season mode** (`OFF_SEASON=true` in `.env`): Telegraf drops all `mqtt_consumer` metrics via a Starlark processor (it stays subscribed so Mosquitto doesn't queue a backlog), the weather sidecar idles without polling, the dashboard opens on the Season tab with a "recording paused" notice on the Temperature tab (`GET /api/mode` → `{ offSeason, latestYear }`), and `verify.sh` skips freshness checks. Truthy values: `true|1|yes|on`.

Helper scripts in `scripts/`:
- `setup.sh` — interactive setup wizard (mode, .env, MQTT auth)
- `start.sh` / `stop.sh` — profile-aware docker compose up/down
- `verify.sh` — health checks per mode
- `mqtt-password.sh` — Mosquitto password management

See `docs/deployment.md` for full setup guides.

## Configuration

All secrets and per-deployment values live in `.env` (copy from `.env.example`). Key gotcha: `INKBIRD_SENSOR_IDS` values must be **unquoted** in `.env` because the TOML string quotes are already in `telegraf.conf`. For multiple sensors: `INKBIRD_SENSOR_IDS=12345", "67890`.

Telegraf uses environment variable substitution in its TOML config — `${INFLUXDB_TOKEN}`, `${INKBIRD_SENSOR_IDS}`, etc. These are injected via the `environment` block in `docker-compose.yml`.

Grafana's InfluxDB datasource is provisioned via `grafana/provisioning/datasources/influxdb.yml` and uses `$INFLUXDB_TOKEN` (Grafana's own env var syntax, not TOML).

## Grafana Dashboard

The default dashboard JSON is at `grafana/provisioning/dashboards/pool-temperature.json`. It is file-provisioned (`allowUiUpdates: true`), so edits in the Grafana UI persist until the container is recreated. To make permanent changes, export the dashboard JSON and replace the file.

## Pool Dashboard (`dashboard/`)

Mobile-first React SPA with Express backend that queries InfluxDB directly. Stack: pnpm, React 19, Vite 8, TypeScript 5.9, recharts, CSS Modules.

### Commands (run from `dashboard/`)
`pnpm` and `node` are only on PATH inside nvm, so prefix every command with `source ~/.nvm/nvm.sh &&` (or wrap in `bash -lc '...'`). Plain `pnpm ...` will fail with "command not found".
```bash
pnpm dev              # Vite dev server (port 5173, proxies /api to 3001)
pnpm dev:server       # Express API server (port 3001)
pnpm build            # TypeScript check + Vite build + server compile
pnpm test             # Vitest watch mode
pnpm test:coverage    # Coverage report (target >= 80%)
pnpm lint             # ESLint
pnpm typecheck        # TypeScript only
```

### Architecture
- **Express server** (`server/`) serves the built SPA + `/api` endpoints. InfluxDB token stays server-side.
- **API endpoints**:
  - `/api/sensors` — list available sensors (id + model)
  - `/api/stats?range=3d&sensor=X` — current, average, peak, season avg/peak. Average and peak follow the selected time range.
  - `/api/history?range=3d&sensor=X` — time-series temperature data
  - `/api/battery?sensor=X` — per-sensor battery levels
  - `/api/battery-history?sensor=X` — 7-day battery history for a sensor
  - `/api/season-history?sensor=X` — year-over-year avg/peak/low comparison
  - `/api/stat-detail?range=3d&stat=average|peak&sensor=X` — period-over-period breakdown (current + 2 previous equal-length periods)
  - `/api/weather/current` — latest air temperature, feels-like, humidity, condition
  - `/api/weather/history?range=...` — aggregated air temperature time series; each point also carries the **dominant weather condition** for its bucket (`{ time, value, conditionCode?, condition? }`, mode of `condition_code` over the window). Drives the chart weather-icon lane.
  - `/api/health` — health check
  - `/api/chemistry?range=...` — GET readings `{ id, date, time, ph?, fc?, cc?, ta?, cya?, ch? }[]` (id = the reading's ISO-UTC timestamp; date/time derived in `TIMEZONE`). POST a reading `{ date, time, <values> }` → `201 { id }`. PUT `{ id, date, time, <values> }` edits it (delete-old-timestamp + write-new, so time changes and field-clearing work). DELETE `?id=<iso>` removes one. POST/PUT/DELETE are Basic-Auth gated + rate-limited; GET is public. Ranges: `30d`/`90d`/`season`/`all`/`custom:`. Partial readings (≥1 of the six values) allowed; storage is InfluxDB with the point's UTC timestamp as its id (two tests on one day = two distinct points; legacy noon-logged readings display as 12:00 until edited).
  - `/api/chemistry/auth-check` — GET, Basic-Auth gated; returns `{ ok: true }` (used by the unlock sheet to validate credentials without writing).
  - `/api/swims?range=...` — GET swim sessions `{ id, date, time, people }[]` (id = the swim's ISO-UTC timestamp; `people` = emoji array). POST `{ date, time, people }` → `201 { id }`. PUT `{ id, date, time, people }` edits (delete-old + write-new). DELETE `?id=<iso>` removes one. **POST/PUT/DELETE share the chemistry Basic-Auth gate + rate limiter** (`CHEM_AUTH_USER`/`CHEM_AUTH_PASSWORD`, `chemistryAuthLimiter`); GET is public. Storage is a separate InfluxDB `swim` measurement; `people` is a comma-joined string field (`server/swim.ts`, `querySwims`/`writeSwim` in `server/influx.ts`). See **Swim logging** below.
  - `/api/events?range=...` — GET maintenance events `{ id, date, time, kind, product?, amount?, unit?, note? }[]` (id = the event's ISO-UTC timestamp; `kind` ∈ `chemical|water|backwash|note`). POST a `{ date, time, kind, …payload }` → `201 { id }`. PUT edits (delete-old + write-new). DELETE `?id=<iso>` removes one. Same shared chemistry Basic-Auth gate + rate limiter as swims; GET is public. Storage is a separate InfluxDB `event` measurement (`kind` + per-kind sparse fields; `server/event.ts` validation, `queryEvents`/`writeEvent` in `server/influx.ts`). See **Maintenance events** below.
  - `/api/season-summary?year=YYYY` — GET the whole-year recap for the **Season** tab (defaults to the current year; 2000..now, else 400). Pure builder `server/seasonSummary.ts` (`buildSeasonSummary`) over raw inputs from `querySeasonSummaryData` in `server/influx.ts` (hourly pool/air means, raw pool max/min, weather condition samples, plus the year's chemistry/swims/events). Days/hours are bucketed in `TIMEZONE`. Cached 10 min per year in `routes.ts`.
  - `/og-image.png` — dynamically generated 1200x630 PNG with current temp (for iMessage/social previews, cached 5 min)
  - All data endpoints accept optional `?sensor=<id>` to filter by sensor; omit for averaged "all sensors" view.
- **OG image**: `server/og-image.ts` generates a social preview image using `@napi-rs/canvas`. Inter font files bundled in `server/fonts/`. Dynamic OG meta tags injected into HTML in production.
- **Data flow**: All API data is in Celsius. F/C conversion happens client-side via `src/utils/temperature.ts`.
- **Weather lane**: `src/components/WeatherLane/` renders a Recharts `<Customized>` layer of sky-condition icons aligned to the chart x-axis (TempChart for every range; ChemFocusSheet full chart, one icon per reading-day). Condition per bucket is computed server-side (`server/weatherBuckets.ts`, mode per `windowPeriod`). The lane takes an optional `xValue` mapper because the two hosts differ: TempChart's x-axis is categorical (time strings) while ChemChart's is numeric (`type="number"`, epoch ms). Fail-silent when condition data is absent.
- **Theming**: CSS custom properties in `src/styles/tokens.css` with `[data-theme="dark"]` overrides. OS detection via `prefers-color-scheme` + manual toggle persisted in localStorage. Light mode uses blue-tinted pool water palette.
- **Multi-sensor**: `GET /api/sensors` returns available sensors (id + model). `SensorSelector` component shows pill chips; hidden when only 1 sensor exists.
- **Interactive details**: All 4 stat cards and battery indicators are tappable:
  - **Average** → period breakdown table (current + 2 previous periods)
  - **Peak** → "Temperature Extremes" table with High and Low per period
  - **Season Avg/Peak** → year-over-year table with Avg, Peak, and Low columns
  - **Battery** → 7-day battery history chart with discharge rate and estimated days remaining
- **Input validation**: All sensor ID params validated against `[a-zA-Z0-9_-]` regex to prevent Flux injection.
- **Multi-sensor "All" view**: When no sensor is selected, stats and history aggregate across all sensors (true average/peak, not one arbitrary sensor). Individual sensor view groups by sensor ID.

### Chemistry tab

A second tab (local `activeTab` state in `App`) logs six manual chemical readings
(`ph`, `fc`, `cc`, `ta`, `cya`, `ch`) to a new InfluxDB `chemistry` measurement and
shows each as a small-multiple trend card correlated against pool/air temperature.
Tapping a card opens a focus `BottomSheet` (full chart + Low/Avg/High + recent
readings). The focus chart has a Recharts hover tooltip (full variant only) showing
the hovered reading's value + date, plus pool/air temp when those overlays are on;
its formatters live in `ChemChart/chemTooltip.ts`. Logging is gated by an Express Basic-Auth middleware (`server/auth.ts`)
on the chemistry write routes; the UI uses a custom unlock sheet (the 401 response
intentionally omits `WWW-Authenticate` to suppress the native browser dialog).
Readings carry a real timestamp (date + time), so two tests on the same day are
distinct points; a **History** sheet (`HistorySheet`) lists every test newest-first,
and tapping one opens the log form in **edit** mode (PUT) with an inline
**delete** confirm — both behind the same unlock gate as logging. New writes are
timestamped at the logged date+time in `TIMEZONE`; the point's UTC timestamp is
the reading's stable id (`server/chemistry.ts` `dateTimeToUtc`/`utcToZonedParts`;
deletes via `server/influxDelete.ts` `DeleteAPI`). No ideal-range/dosing logic —
numbers and trends only.

**Auth hardening notes:**
- The chemistry auth endpoints (`POST /api/chemistry`, `/api/chemistry/auth-check`)
  are rate-limited in `server/rateLimit.ts` (10 attempts / 15 min per client IP,
  applied before `requireAuth`) to blunt brute-forcing the shared password. The
  limiter keys on `CF-Connecting-IP` (the app is reached via cloudflared, so
  `req.ip` would otherwise be the tunnel); `index.ts` sets `trust proxy: 1`.
- The unlock sheet persists the credential as base64 `user:pass` in `localStorage`
  (`useChemAuth`). This is **accepted for the threat model** — a single shared
  credential on a personal, read-only-public dashboard; it gates only writes, and
  XSS would already be game-over. If the model ever broadens (multiple users,
  sensitive writes), switch to a short-lived server-issued token instead.

### Swim logging

An anonymous **swim log**: who went in the pool (one or more **emoji** avatars —
never names, for privacy on the public dashboard) and when. Lives on the
**Temperature tab** (its own History + ＋ Log swim actions, separate from the
chemistry tab's). Three parts:

- **Markers riding the curve** — a `SwimLane` overlay (`src/components/SwimLane/`)
  renders an emoji pin on the pool-temp curve (TempChart) and on each chemical's
  curve (ChemFocusSheet full chart) at the swim's time. It is a Recharts child
  (same pattern as `WeatherLane`) reading `useXAxisScale`/`useYAxisScale`/
  `usePlotArea`. x is positioned by **index interpolation** on the categorical
  TempChart axis (`xMode="index"`) and by the numeric scale on ChemChart
  (`xMode="scale"`); y interpolates the host series value at the swim time
  (`src/utils/markerPositions.ts`). Because ChemChart has two y-axes, SwimLane
  takes a `yAxisId` prop (`"chem"` there; default for TempChart). Fail-silent when
  a swim falls outside the plotted domain. Markers are informational (not tappable).
- **Log/edit/delete flow** (`src/components/SwimLogFlow/`) — unlock gate → form with
  a recent-swimmers grid + a ＋ tile opening a categorized `EmojiKeyboard`
  (`src/constants/swim.ts`). **Reuses the chemistry unlock** (`useChemAuth`, same
  shared credential) — unlocking one unlocks both.
- **Swim History sheet** (`src/components/SwimHistorySheet/`) — two tabs: **All
  swims** (newest-first, tap to edit) and a **Leaderboard** of total dips per
  emoji. Pure helpers (`sortedSwims`/`totalDips`/`recentEmoji`/`leaderboard`) in
  `src/utils/swim.ts`; data via `useSwimData(range)`.

Storage is a separate InfluxDB `swim` measurement (point timestamp = the swim's
date+time in `TIMEZONE`, also its stable id; `people` stored comma-joined). No
names/accounts — "same emoji = same person" is a soft convention only.

### Maintenance events

A **maintenance log** of four event kinds — **chemical** (🧪 product/amount/unit),
**water** (💧 amount/unit), **backwash** (🔄), **note** (📝) — surfaced on the charts
exactly like swims. **Built as a structural twin of swim logging** (`EventLane` ≈
`SwimLane`, `EventLogFlow` ≈ `SwimLogFlow`, `LogBookSheet` ≈ `SwimHistorySheet`,
`useEventData`/`utils/events.ts`/`constants/events.ts` ≈ the swim equivalents). Unlike
swims, the **logging UI lives on the Chemistry tab** (a "Log event" row of four kind
buttons + a "Log book ›" link, under the existing History / ＋ Log test); the temperature
chart shows only the markers + the Events pill.

- **Markers** — `EventLane` (`src/components/EventLane/`) draws a **square kind-colored
  chip** on a stem+foot pin (compact chip on the 66px preview cards), riding the pool-temp
  curve (TempChart, index mode) and the chemistry curves (ChemChart full + mini, scale
  mode, `yAxisId="chem"`). Reuses `markerPositions.ts` + the same off-domain-skip and
  compact-mode logic as `SwimLane`; color per `EVENT_KINDS[kind]`.
- **Events `OverlayPill`** (🧰, teal) toggles all maintenance markers — on the temp chart,
  the chem tab (gates the preview cards), and the chem focus sheet — only when events exist.
- **Log flow** (`src/components/EventLogFlow/`) — `EventLogForm` (one component, fields
  switch on kind), `EventKindChooser`, behind the shared chemistry unlock (`useChemAuth`).
- **Log book** (`src/components/LogBookSheet/`) — chronological entries, filterable by kind,
  tap to edit/delete; fed a season-wide `useEventData('season')` so it doesn't shrink with
  the chart range.

Storage is a separate InfluxDB `event` measurement: point timestamp = the event's date+time
in `TIMEZONE` (stable id); `kind` is stored on every point plus only the sparse fields that
kind uses (`product`/`unit`/`note` strings, `amount` float). `server/event.ts` does per-kind
validation; `queryEvents`/`writeEvent` in `server/influx.ts`.

### Season tab

A third tab (`src/components/SeasonSummary/`) styled as an arcade high-score screen
(theme-independent CRT palette; `Press Start 2P` + `VT323` from Google Fonts). Shows a
◀ year ▶ picker, a top score bar, the swim **HIGH SCORES** leaderboard, "stages" of
stats (water temp, chemistry, maintenance, weather, swims) and **ACHIEVEMENTS UNLOCKED**
fun facts. Fun-fact text and unit-aware formatting live in `src/utils/seasonFacts.ts`
(`fmtDelta` converts temperature *differences* without the +32 offset). Data via
`useSeasonSummary(year)` (one-shot fetch, no polling).

### Query aggregation strategy
All time-series queries use `aggregateWindow` with `fn: mean` (temperature) or `fn: last` (battery). Note: `aggregateWindow` `location` parameter is not available in InfluxDB OSS 2.x (Cloud only), so windows align to UTC.

| Range | Window | ~Points | Notes |
|-------|--------|---------|-------|
| 6H | 5m | 72 | Zoomed-in, high resolution |
| 12H | 5m | 144 | |
| 24H | 5m | 288 | Captures pump cycles |
| 3D | 30m | 144 | Captures afternoon heating peaks |
| 7D | 1h | 168 | |
| 30D | 2h | 360 | |
| Custom | auto | varies | Scales by date span (5m–6h) |

Battery history uses `6h` windows with `createEmpty: true` + `fill(usePrevious: true)` since battery level is a held state between sparse reports. Pool history also uses `fill(usePrevious)` to hold readings across sensor dropouts, then applies a client-side EMA (alpha=0.25) in `TempChart` to smooth the stair-stepping caused by 0.1°C sensor resolution.

**Measurement filtering:** All pool Flux queries must include `filter(fn: (r) => r._measurement == "mqtt_consumer")` because the `weather` sidecar writes a `temperature_C` field too and would otherwise leak into pool stats, history, sensor list, and season queries. The weather queries filter on `_measurement == "weather"`.

### Temperature color zones
| Zone | Threshold |
|------|-----------|
| cool (blue) | < 70°F (21.1°C) |
| normal (green) | 70–80°F |
| warm (amber) | 80–90°F |
| hot (red) | >= 90°F (32.2°C) |

### Environment variables (dashboard)
| Variable | Required | Description |
|----------|----------|-------------|
| `INFLUXDB_URL` | Yes | InfluxDB URL (set automatically in docker-compose) |
| `INFLUXDB_TOKEN` | Yes | InfluxDB auth token |
| `INFLUXDB_ORG` | Yes | InfluxDB organization |
| `INFLUXDB_BUCKET` | Yes | InfluxDB bucket |
| `DASHBOARD_TITLE` | No | Header title (default: "Pool Dashboard"), build-time via `VITE_APP_TITLE` |
| `PUBLIC_URL` | No | Absolute URL for OG image (default: request Host header) |
| `TIMEZONE` | No | IANA timezone for OG image and server-side dates (default: America/New_York). Also sets `TZ` in the container. |
| `WEATHERAPI_KEY` | Yes (for weather) | weatherapi.com API key |
| `WEATHER_LOCATION` | Yes (for weather) | Location passed to weatherapi `q` param. Use a zip code or `City, State, Country` — bare city names like `Cheltenham, PA` resolve to the wrong place (e.g. Cheltenham UK). The worker stores the API-resolved `name, region, country` as the `location` tag so mismatches are visible. |
| `CHEM_AUTH_USER` | Yes (for logging) | Username for the Basic-Auth gate on chemistry writes |
| `CHEM_AUTH_PASSWORD` | Yes (for logging) | Password for the Basic-Auth gate on chemistry writes |
| `OFF_SEASON` | No | `true` = off-season mode (see Deployment Modes). Default `false`. |

### Rebuilding the dashboard
```bash
docker compose build dashboard && docker compose up -d dashboard        # normal rebuild
docker compose build --no-cache dashboard && docker compose up -d dashboard  # force full rebuild
```
Runtime env vars (`INFLUXDB_*`, `PUBLIC_URL`, `TIMEZONE`) take effect on restart. Build-time vars (`DASHBOARD_TITLE`) require a rebuild.

## Grafana Dashboard

Flux query for temperature in Fahrenheit:
```flux
from(bucket: "pool_temps")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._field == "temperature_C")
  |> aggregateWindow(every: v.windowPeriod, fn: last, createEmpty: false)
  |> map(fn: (r) => ({ r with _value: r._value * 9.0 / 5.0 + 32.0 }))
```
