# Pool Temperature Monitor

A Raspberry Pi-based pool temperature monitoring system that captures wireless sensor data via SDR and displays it on a Grafana dashboard.

The Inkbird IBS-P02R pool thermometer transmits on 433.92 MHz. An RTL-SDR dongle receives the signal, rtl_433 decodes it and publishes to MQTT, Telegraf writes the data to InfluxDB, and Grafana visualizes it.

```
Inkbird IBS-P02R --> 433 MHz --> RTL-SDR --> rtl_433 --> Mosquitto (MQTT) --> Telegraf --> InfluxDB --> Grafana
```

## Parts List

| Part | Description | Link |
|------|-------------|------|
| Raspberry Pi 5 | Runs all services via Docker | |
| RTL-SDR Blog V4 | USB software-defined radio receiver | [Amazon](https://www.amazon.com/dp/B0CD745394) |
| Kaunosta 433 MHz Antenna | High-gain antenna with magnetic base and RG58 cable | [Amazon](https://www.amazon.com/dp/B0DLZVPH8G) |
| Inkbird IBS-P02R | Wireless floating pool thermometer | [Inkbird](https://www.inkbird.com/collections/pool-thermometers/products/wireless-pool-thermometer-set-ibs-p02r) |

## Architecture

All services run as Docker containers via `docker-compose.yml`:

- **rtl_433** - Decodes 433 MHz signals from the Inkbird sensor (protocol 194) and publishes JSON to MQTT
- **Mosquitto** - MQTT broker
- **Telegraf** - Subscribes to MQTT, filters by sensor ID, and writes to InfluxDB
- **InfluxDB 2** - Time-series database for temperature data
- **Grafana** - Dashboard and visualization

## Setup

### 1. Clone and configure

```bash
git clone <repo-url>
cd pool_monitor
cp .env.example .env
```

Edit `.env` with your values:

```
INFLUXDB_ORG=pool
INFLUXDB_BUCKET=pool_temps
INFLUXDB_TOKEN=<your-token>
INFLUXDB_USER=admin
INFLUXDB_PASSWORD=<your-password>
INKBIRD_SENSOR_ID=<your-sensor-id>
GRAFANA_ADMIN_PASSWORD=<your-password>
```

### 2. Find your sensor ID

Start the stack and check the MQTT output:

```bash
docker compose up -d
docker exec mosquitto mosquitto_sub -t "rtl_433/#" -v -C 1
```

Look for the `id` field in the JSON payload and set `INKBIRD_SENSOR_ID` in `.env`.

### 3. Start the stack

```bash
docker compose up -d
```

### 4. Access the dashboards

- **Grafana**: http://localhost:3000 (login with `admin` / your `GRAFANA_ADMIN_PASSWORD`)
- **InfluxDB**: http://localhost:8086

### Grafana Query

Example Flux query for a temperature panel (Fahrenheit):

```flux
from(bucket: "pool_temps")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r._field == "temperature_C")
  |> aggregateWindow(every: v.windowPeriod, fn: last, createEmpty: false)
  |> map(fn: (r) => ({ r with _value: r._value * 9.0 / 5.0 + 32.0 }))
  |> yield(name: "temperature")
```
