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
- Tighten the Mosquitto password file permissions. Mosquitto 2.x warns on a
  world-readable password file (`File ... has world readable permissions. Future
  versions will refuse to load this file.`) and future versions will refuse to
  load it. Fix once:
  ```bash
  docker exec mosquitto chmod 0700 /mosquitto/config/password_file
  ```
  The file is bind-mounted from the repo's `mosquitto/` directory, so `chmod`
  persists on the host. (`chown root` is also suggested by the warning but the
  container's mosquitto process runs unprivileged; `chmod 0700` is the one that
  matters and silences the load-refusal warning.)

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

**"Not authorized" / `disconnected, not authorised` loop in Mosquitto, Telegraf, or rtl_433 logs**

This means the connecting client is sending a username/password that the broker's
password file doesn't accept. Two distinct causes — check both:

1. **Credential mismatch.** The broker's stored password for the user must equal the
   `MQTT_PASSWORD` the client sends. Verify the broker actually accepts the `.env`
   credentials (no output = success):
   ```bash
   docker exec mosquitto mosquitto_pub -h localhost -t test -m hi \
     -u "$MQTT_USER" -P "$MQTT_PASSWORD"
   ```
   If it returns `not authorised`, reset the broker password to match `.env`:
   ```bash
   docker exec mosquitto mosquitto_passwd -b /mosquitto/config/password_file "$MQTT_USER" "$MQTT_PASSWORD"
   docker compose up -d --force-recreate mosquitto
   ```
   Note the password file is per-broker — in split mode the Pi's broker is the only
   one, and both rtl_433 (Pi) and Telegraf (server) must use the credentials that
   match *that* file.

2. **Stale container running an old definition.** `docker compose restart` only
   restarts the existing container with its *old* config — it does **not** pick up
   changes to `docker-compose.yml` or `.env`. After any credential/compose change,
   recreate the affected containers:
   ```bash
   git pull        # if the compose change came from the repo
   docker compose up -d --force-recreate rtl_433 mosquitto
   ```
   rtl_433 authenticates using the `user=`/`pass=` options embedded in its `-F`
   MQTT output URL (substituted from `MQTT_USER`/`MQTT_PASSWORD` in `.env`); it also
   honors `MQTT_USERNAME`/`MQTT_PASSWORD` env vars if set. Either way the running
   container must have been (re)created *after* the credentials were in place.

**No data in dashboard after setup**
- Check Telegraf logs: `docker logs --since 5m telegraf`
- Verify sensor IDs match: `INKBIRD_SENSOR_IDS` must be the same on both machines
- Wait 60 seconds — the sensor transmits roughly once per minute

**Stale data (dashboard not updating)**
- Check rtl_433 is receiving: `docker logs --since 5m rtl_433` on the Pi
- Check sensor is in range and has battery
- Run `./scripts/verify.sh` on both machines

**Phantom / duplicate sensor — a flat, never-changing second reading for an existing sensor id**

Symptom: an existing sensor id shows a second data stream that sits at one frozen value
(e.g. a flat 22 °C) and drags stats toward it, even though you only own one device.

Cause: rtl_433's MQTT topic embeds its container hostname (`rtl_433/<hostname>/events`). If
the container is **recreated** (e.g. `--force-recreate`), it gets a new hostname → a new
topic, and the **old topic keeps its last *retained* message** on the broker. Telegraf
re-subscribes on every reconnect, so the broker re-delivers that frozen retained value, which
Telegraf ingests with a fresh timestamp — a phantom "sensor" that never changes. (This repo
now pins the topic to `rtl_433/sensor/events` and disables `retain`, so new deployments don't
create orphan topics; the steps below clean up any that already exist.)

Fix:
1. Make sure you're on a build with the pinned topic + retain disabled, then recreate:
   ```bash
   git pull
   docker compose up -d --force-recreate rtl_433
   ```
2. Identify the orphan topic(s): the phantom's topic is `rtl_433/<old-hostname>/events`
   (the hex segment that is **not** `sensor`). List active topics with:
   ```bash
   docker compose exec mosquitto mosquitto_sub -t 'rtl_433/+/events' -v -u "$MQTT_USER" -P "$MQTT_PASSWORD" -W 5
   ```
3. Clear the retained message on each orphan topic (empty payload + retain flag deletes it):
   ```bash
   docker compose exec mosquitto mosquitto_pub -r -n -u "$MQTT_USER" -P "$MQTT_PASSWORD" \
     -t 'rtl_433/<old-hostname>/events'
   ```
4. Confirm only `rtl_433/sensor/events` produces new points for the sensor id (check the
   dashboard, or query InfluxDB for distinct `topic` tags over the last few minutes).

Related: if Telegraf reconnects frequently (`docker compose logs --since 1h mosquitto |
grep <telegraf-client-id>`), each reconnect re-triggers retained re-delivery — see the next
entry.

**Telegraf reconnect flapping + missing data (split mode)**

Symptoms: Telegraf logs `connection lost: pingresp not received, disconnecting`; Mosquitto
logs `Client telegraf-pool has exceeded timeout, disconnecting`; the dashboard updates in
sparse bursts with long gaps.

Cause: in split mode Telegraf (server) talks to Mosquitto (Pi) **across the LAN**. When that
link drops the MQTT keepalive ping (PINGREQ/PINGRESP) — flaky Wi-Fi, RF interference, or a
busy/under-powered Pi — both ends time out the keepalive and Telegraf disconnects, then
reconnects with a multi-minute backoff. This is an **infrastructure problem, not a config
bug**, so there is no `telegraf.conf` setting that prevents it.

Data resilience (already configured): rtl_433 publishes at **`qos=1`** and Telegraf uses a
**persistent session** (`persistent_session = true`, fixed `client_id`, subscription
`qos = 1`). Together these make Mosquitto **queue** messages for Telegraf while it is offline
and deliver them on reconnect, so readings survive the flapping. (With rtl_433's default
`qos=0`, Mosquitto drops messages for an offline subscriber → permanent data loss. If you
ever see gaps despite reconnects, confirm rtl_433's `-F mqtt://…` URL still includes `qos=1`.)

Reduce the flapping itself (infra, on the Pi):
- Prefer **wired Ethernet** over Wi-Fi for the Pi, or improve Wi-Fi signal / disable Wi-Fi
  power-save (`iw dev wlan0 set power_save off`).
- Check the Pi isn't CPU/IO-starved (`docker stats`, `top`) — a busy broker host is slow to
  answer keepalive pings.
- If queues ever overflow during long outages, raise Mosquitto's `max_queued_messages`
  (default 1000; at ~1 reading/min that is ~16 h of buffer).
