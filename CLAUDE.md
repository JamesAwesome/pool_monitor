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
- **Mosquitto** — MQTT broker on port 1883, anonymous access
- **Telegraf** (`telegraf/telegraf.conf`) — subscribes to `rtl_433/+/events`, filters by sensor ID, writes to InfluxDB
- **InfluxDB 2** — time-series store on port 8086, Flux query language
- **Grafana** — dashboards on port 3000, provisioned datasource and dashboards from `grafana/provisioning/`
- **dashboard** (`dashboard/`) — React/Express SPA on port 8080, queries InfluxDB directly (see below)
- **cloudflared** — Cloudflare Tunnel for public HTTPS access

## Common Commands

```bash
docker compose up -d          # Start all services
docker compose down            # Stop all services
docker compose logs -f         # Tail all logs
docker compose logs -f telegraf  # Debug a specific service
docker compose restart telegraf  # Restart a single service after config change
```

## Configuration

All secrets and per-deployment values live in `.env` (copy from `.env.example`). Key gotcha: `INKBIRD_SENSOR_IDS` values must be **unquoted** in `.env` because the TOML string quotes are already in `telegraf.conf`. For multiple sensors: `INKBIRD_SENSOR_IDS=12345", "67890`.

Telegraf uses environment variable substitution in its TOML config — `${INFLUXDB_TOKEN}`, `${INKBIRD_SENSOR_IDS}`, etc. These are injected via the `environment` block in `docker-compose.yml`.

Grafana's InfluxDB datasource is provisioned via `grafana/provisioning/datasources/influxdb.yml` and uses `$INFLUXDB_TOKEN` (Grafana's own env var syntax, not TOML).

## Grafana Dashboard

The default dashboard JSON is at `grafana/provisioning/dashboards/pool-temperature.json`. It is file-provisioned (`allowUiUpdates: true`), so edits in the Grafana UI persist until the container is recreated. To make permanent changes, export the dashboard JSON and replace the file.

## Pool Dashboard (`dashboard/`)

Mobile-first React SPA with Express backend that queries InfluxDB directly. Stack: pnpm, React 19, Vite 8, TypeScript 5.9, recharts, CSS Modules.

### Commands (run from `dashboard/`)
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
- **API endpoints**: `/api/sensors`, `/api/stats`, `/api/history?range=12h`, `/api/battery`, `/api/health`. All accept optional `?sensor=<id>` to filter by sensor; omit for averaged "all sensors" view.
- **Data flow**: All API data is in Celsius. F/C conversion happens client-side via `src/utils/temperature.ts`.
- **Theming**: CSS custom properties in `src/styles/tokens.css` with `[data-theme="dark"]` overrides. OS detection via `prefers-color-scheme` + manual toggle persisted in localStorage.
- **Multi-sensor**: `GET /api/sensors` returns available sensors (id + model). `SensorSelector` component shows pill chips; hidden when only 1 sensor exists.

### Temperature color zones
| Zone | Threshold |
|------|-----------|
| cool (blue) | < 70°F (21.1°C) |
| normal (green) | 70–80°F |
| warm (amber) | 80–90°F |
| hot (red) | >= 90°F (32.2°C) |

## Grafana Dashboard

Flux query for temperature in Fahrenheit:
```flux
from(bucket: "pool_temps")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._field == "temperature_C")
  |> aggregateWindow(every: v.windowPeriod, fn: last, createEmpty: false)
  |> map(fn: (r) => ({ r with _value: r._value * 9.0 / 5.0 + 32.0 }))
```
