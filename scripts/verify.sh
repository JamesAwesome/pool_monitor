#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

DEPLOY_MODE="${DEPLOY_MODE:-standalone}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }

ERRORS=0

echo "=== Pool Monitor Health Check (mode: $DEPLOY_MODE) ==="
echo ""

# --- Edge checks ---
if [ "$DEPLOY_MODE" = "edge" ] || [ "$DEPLOY_MODE" = "standalone" ]; then
  echo "Edge services:"

  # Mosquitto
  if docker ps --format '{{.Names}}' | grep -q '^mosquitto$'; then
    pass "Mosquitto is running"
  else
    fail "Mosquitto is not running"
  fi

  # rtl_433
  if docker ps --format '{{.Names}}' | grep -q '^rtl_433$'; then
    RECENT=$(docker logs --since 5m rtl_433 2>&1 | grep -c "Inkbird" || true)
    if [ "$RECENT" -gt 0 ]; then
      pass "rtl_433 is running ($RECENT Inkbird messages in last 5 min)"
    else
      warn "rtl_433 is running but no Inkbird messages in last 5 min"
    fi
  else
    fail "rtl_433 is not running"
  fi
  echo ""
fi

# --- Server checks ---
if [ "$DEPLOY_MODE" = "server" ] || [ "$DEPLOY_MODE" = "standalone" ]; then
  echo "Server services:"

  # InfluxDB
  if docker inspect influxdb --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy; then
    pass "InfluxDB is healthy"
  elif docker ps --format '{{.Names}}' | grep -q '^influxdb$'; then
    warn "InfluxDB is running but health check not yet passing"
  else
    fail "InfluxDB is not running"
  fi

  # Telegraf
  if docker ps --format '{{.Names}}' | grep -q '^telegraf$'; then
    TELEGRAF_ERRORS=$(docker logs --since 5m telegraf 2>&1 | grep -ci "error\|connection refused\|timeout" || true)
    if [ "$TELEGRAF_ERRORS" -eq 0 ]; then
      pass "Telegraf is running (no errors in last 5 min)"
    else
      warn "Telegraf has $TELEGRAF_ERRORS error(s) in last 5 min — check: docker logs --since 5m telegraf"
    fi
  else
    fail "Telegraf is not running"
  fi

  # MQTT connectivity (server mode only)
  if [ "$DEPLOY_MODE" = "server" ]; then
    MQTT_HOST="${MQTT_HOST:-mosquitto}"
    MQTT_PORT="${MQTT_PORT:-1883}"
    echo ""
    echo "  Testing MQTT connectivity to $MQTT_HOST:$MQTT_PORT..."
    if timeout 5 bash -c "echo > /dev/tcp/$MQTT_HOST/$MQTT_PORT" 2>/dev/null; then
      pass "Can reach MQTT broker at $MQTT_HOST:$MQTT_PORT"
    else
      fail "Cannot reach MQTT broker at $MQTT_HOST:$MQTT_PORT"
    fi
  fi

  # Grafana
  if docker ps --format '{{.Names}}' | grep -q '^grafana$'; then
    pass "Grafana is running (http://localhost:3000)"
  else
    fail "Grafana is not running"
  fi

  # Dashboard
  if docker ps --format '{{.Names}}' | grep -q '^pool-dashboard$'; then
    pass "Dashboard is running (http://localhost:8080)"
  else
    fail "Dashboard is not running"
  fi

  # cloudflared
  if docker ps --format '{{.Names}}' | grep -q '^cloudflared$'; then
    pass "cloudflared is running"
  else
    warn "cloudflared is not running (optional)"
  fi

  # Data freshness
  if [ -n "${INFLUXDB_TOKEN:-}" ] && docker ps --format '{{.Names}}' | grep -q '^influxdb$'; then
    echo ""
    echo "  Checking for recent data in InfluxDB..."
    RECENT_DATA=$(docker exec influxdb influx query \
      'from(bucket: "pool_temps") |> range(start: -1h) |> limit(n: 1)' \
      --org "${INFLUXDB_ORG:-pool}" --token "$INFLUXDB_TOKEN" 2>&1 || true)
    if echo "$RECENT_DATA" | grep -q "temperature_C\|battery_ok"; then
      pass "InfluxDB has data from the last hour"
    else
      warn "No data in InfluxDB from the last hour"
    fi
  fi

  # Weather checks (only when WEATHERAPI_KEY is configured)
  if [ -n "${WEATHERAPI_KEY:-}" ]; then
    echo ""
    echo "  Weather sidecar:"
    if docker ps --format '{{.Names}}' | grep -q '^weather$'; then
      pass "weather container is running"
    else
      fail "weather container is not running"
    fi

    if [ -n "${INFLUXDB_TOKEN:-}" ] && docker ps --format '{{.Names}}' | grep -q '^influxdb$'; then
      FLUX='from(bucket: "'"${INFLUXDB_BUCKET:-pool_temps}"'") |> range(start: -2h) |> filter(fn: (r) => r._measurement == "weather") |> filter(fn: (r) => r._field == "temperature_C") |> last()'
      RESULT=$(docker exec influxdb influx query --org "${INFLUXDB_ORG:-pool}" --token "${INFLUXDB_TOKEN}" "${FLUX}" 2>/dev/null || true)
      if echo "${RESULT}" | grep -q temperature_C; then
        pass "Recent weather data in InfluxDB (within last 2h)"
      else
        warn "No recent weather data in InfluxDB (expected within last 2h)"
      fi
    fi
  fi
  echo ""
fi

# Summary
echo "==========================="
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}All checks passed.${NC}"
else
  echo -e "${RED}$ERRORS check(s) failed.${NC} See above for details."
  exit 1
fi
