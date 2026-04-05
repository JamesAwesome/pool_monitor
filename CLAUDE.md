# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Raspberry Pi-based pool temperature monitor. An Inkbird IBS-P02R wireless thermometer transmits on 433.92 MHz, received by an RTL-SDR dongle. The data pipeline is:

```
Inkbird sensor -> 433 MHz -> RTL-SDR -> rtl_433 -> Mosquitto (MQTT) -> Telegraf -> InfluxDB 2 -> Grafana
```

## Stack

Everything runs as Docker containers via `docker-compose.yml`. There is no application code — the project is entirely configuration files:

- **rtl_433** (`hertzg/rtl_433`) — decodes protocol 194 (Inkbird), publishes JSON to MQTT
- **Mosquitto** — MQTT broker on port 1883, anonymous access
- **Telegraf** (`telegraf/telegraf.conf`) — subscribes to `rtl_433/+/events`, filters by sensor ID, writes to InfluxDB
- **InfluxDB 2** — time-series store on port 8086, Flux query language
- **Grafana** — dashboards on port 3000, provisioned datasource and dashboards from `grafana/provisioning/`
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

Flux query for temperature in Fahrenheit:
```flux
from(bucket: "pool_temps")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._field == "temperature_C")
  |> aggregateWindow(every: v.windowPeriod, fn: last, createEmpty: false)
  |> map(fn: (r) => ({ r with _value: r._value * 9.0 / 5.0 + 32.0 }))
```
