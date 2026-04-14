# Deployment Guide

The pool monitor supports two deployment modes:

- **Standalone** — everything on one machine (e.g., a Raspberry Pi). This is the default.
- **Split** — the Pi runs only the radio receiver + MQTT broker (edge), and a separate server handles data storage and dashboards.

## Quick Start: Standalone

All services on one machine. The simplest setup.

```bash
git clone <repo> && cd pool_monitor
./scripts/setup.sh          # select "standalone"
nano .env                    # set INFLUXDB_TOKEN, sensor IDs, etc.
./scripts/start.sh
./scripts/verify.sh
```

The setup wizard creates `.env` from the template and sets `DEPLOY_MODE=standalone`. Edit `.env` with your InfluxDB credentials, sensor IDs, and other settings (see `.env.example` for all options).

## Split Mode

Split mode separates the hardware-dependent radio receiver from the data pipeline. The Pi becomes a lightweight data collector; a more powerful machine handles storage and visualization.

**What runs where:**

| Raspberry Pi (edge) | Server |
|---------------------|--------|
| rtl_433 (SDR radio) | Telegraf |
| Mosquitto (MQTT)    | InfluxDB |
|                     | Grafana |
|                     | Dashboard |
|                     | cloudflared |

The two machines communicate over MQTT on your local network.

### Step 1: Set Up the Pi (Edge)

```bash
git clone <repo> && cd pool_monitor
sudo ./scripts/setup.sh     # select "edge", enable MQTT auth
./scripts/start.sh
./scripts/verify.sh
```

> **Note:** `setup.sh` needs `sudo` on the Pi because Docker creates files as root. The script will use `sudo` automatically when fixing file permissions.

The setup wizard will:
- Ask for an MQTT username and password
- Generate the Mosquitto password file
- Set the MQTT credentials in `.env` (rtl_433 uses them to authenticate with Mosquitto)
- Switch to the auth-enabled Mosquitto config
- Print the MQTT credentials you'll need for the server

**Note the Pi's IP address** — you'll need it for the server setup.

### Step 2: Set Up the Server

```bash
git clone <repo> && cd pool_monitor
./scripts/setup.sh          # select "server", enter Pi's IP + MQTT credentials
nano .env                    # set INFLUXDB_TOKEN, GRAFANA_ADMIN_PASSWORD, etc.
./scripts/start.sh
./scripts/verify.sh
```

The setup wizard will:
- Ask for the Pi's IP address
- Ask for the MQTT credentials (must match what you set on the Pi)
- Update `.env` with the connection details

### Verifying the Connection

After starting both machines, run `./scripts/verify.sh` on the server. It checks:

- All containers are running and healthy
- Telegraf can reach the Pi's MQTT broker
- Data is flowing into InfluxDB
- Dashboard and Grafana are accessible

If Telegraf shows connection errors, check:
- The Pi's IP address is correct in `.env`
- Port 1883 is reachable from the server (`nc -zv <pi-ip> 1883`)
- MQTT credentials match between Pi and server
- The Pi's firewall allows port 1883

## Helper Scripts

| Script | Description |
|--------|-------------|
| `scripts/setup.sh` | Interactive setup — mode selection, .env creation, MQTT auth |
| `scripts/start.sh` | Start services for the configured mode |
| `scripts/stop.sh` | Stop services |
| `scripts/verify.sh` | Health check with color-coded results |
| `scripts/mqtt-password.sh` | Create/update MQTT passwords |

All scripts read `DEPLOY_MODE` from `.env` to determine which Docker Compose profile to use. You can also use Docker Compose directly:

```bash
docker compose --profile standalone up -d
docker compose --profile edge up -d
docker compose --profile server up -d
```

## Data Resilience

In split mode, network interruptions between the Pi and server are handled automatically:

- **Short outages (minutes):** Mosquitto queues messages for Telegraf's persistent session. On reconnect, Telegraf receives all queued messages. No data loss.
- **Long outages (up to ~27 hours):** Mosquitto buffers up to 10,000 messages. At ~6 sensor readings per minute, this covers about 27 hours.
- **Very long outages:** The buffer fills and oldest messages are dropped. The dashboard handles data gaps gracefully — charts connect adjacent data points.

## Security

In split mode, the MQTT port (1883) is exposed on the Pi's network interface. The setup wizard enables password authentication by default. Both rtl_433 (on the Pi) and Telegraf (on the server) authenticate with the same MQTT credentials.

**Recommendations:**
- Always enable MQTT authentication in split mode
- If the server is not on the same LAN as the Pi, connect them with a VPN (e.g., Tailscale or WireGuard) rather than exposing MQTT to the internet

## Weather sidecar (optional)

A small Node sidecar can pull outdoor air temperature from [weatherapi.com](https://www.weatherapi.com/) every 30 minutes and write it to InfluxDB, so the dashboard can show air temperature alongside pool temperature.

To enable:

1. Get a free API key at https://www.weatherapi.com/
2. Set `WEATHERAPI_KEY` and `WEATHER_LOCATION` in `.env` (or re-run `./scripts/setup.sh`)
3. Run `./scripts/start.sh` — the `weather` container starts automatically on the `standalone` and `server` profiles

If `WEATHERAPI_KEY` is empty, `start.sh` skips the weather container. Data appears in the dashboard within ~30 minutes of the first successful fetch.

## Troubleshooting

**"Connection refused" in Telegraf logs**
- Check that Mosquitto is running on the Pi: `docker ps` on the Pi
- Check the Pi's IP is correct: `grep MQTT_HOST .env`
- Check the port is open: `nc -zv <pi-ip> 1883`
- Check firewall: `sudo ufw status` (if using ufw)

**"Not authorized" in Telegraf or rtl_433 logs**
- MQTT credentials don't match. Verify `MQTT_USER` and `MQTT_PASSWORD` in `.env` match the Mosquitto password file on both machines
- Re-run `./scripts/mqtt-password.sh <user> <password>` on the Pi if needed
- rtl_433 reads credentials from `MQTT_USERNAME`/`MQTT_PASSWORD` env vars (mapped from `MQTT_USER`/`MQTT_PASSWORD` in docker-compose.yml)

**No data in dashboard after setup**
- Check Telegraf logs: `docker logs --since 5m telegraf`
- Verify sensor IDs match: `INKBIRD_SENSOR_IDS` must be the same on both machines
- Wait 60 seconds — the sensor transmits roughly once per minute

**Stale data (dashboard not updating)**
- Check rtl_433 is receiving: `docker logs --since 5m rtl_433` on the Pi
- Check sensor is in range and has battery
- Run `./scripts/verify.sh` on both machines
