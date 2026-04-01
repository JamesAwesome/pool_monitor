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
INKBIRD_SENSOR_IDS="29908"
GRAFANA_ADMIN_PASSWORD=<your-password>
```

To add multiple sensors, comma-separate the quoted IDs:

```
INKBIRD_SENSOR_IDS="29908", "12345"
```

### 2. Hardware setup

1. Connect the 433 MHz antenna to the RTL-SDR dongle via the SMA connector
2. Plug the RTL-SDR dongle into a USB port on the Raspberry Pi
3. Place the Inkbird sensor in the pool and make sure it's transmitting (the display should be active)

Verify the Pi sees the dongle:

```bash
lsusb | grep -i rtl
```

You should see something like `Realtek Semiconductor Corp. RTL2832U DVB-T`.

### 3. Find your sensor IDs

Before starting the full stack, you can use rtl_433 directly to discover nearby sensors:

```bash
docker run --rm --privileged -v /dev/bus/usb:/dev/bus/usb hertzg/rtl_433 -f 433.92M -R 194
```

This listens for Inkbird sensors (protocol 194) and prints decoded packets to the console. You should see output like:

```
time      : 2026-04-01 12:00:00
model     : Inkbird-ITH20R
id        : 29908
channel   : 0
battery_ok: 1
temperature_C: 26.100
humidity  : 58
```

Note the `id` value for each sensor you want to monitor. Press `Ctrl+C` to stop.

If you don't see any output, try removing `-R 194` to listen for all protocols — this helps confirm the dongle is working:

```bash
docker run --rm --privileged -v /dev/bus/usb:/dev/bus/usb hertzg/rtl_433 -f 433.92M
```

Add your sensor ID(s) to `INKBIRD_SENSOR_IDS` in `.env`:

```
# Single sensor
INKBIRD_SENSOR_IDS="29908"

# Multiple sensors
INKBIRD_SENSOR_IDS="29908", "12345"
```

### 4. Start the stack

```bash
docker compose up -d
```

Verify everything is running:

```bash
docker compose logs -f
```

Look for:
- `rtl_433` connecting to the SDR dongle with no errors
- `telegraf` connecting to MQTT (`Connected [tcp://mosquitto:1883]`)
- No `401 Unauthorized` errors from InfluxDB

### 5. Access the dashboards

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
