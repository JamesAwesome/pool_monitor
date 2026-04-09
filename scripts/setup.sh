#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Pool Monitor Setup ==="
echo ""
echo "Deployment modes:"
echo "  1) standalone  — All services on this machine (default)"
echo "  2) edge        — Raspberry Pi only: RTL-SDR + MQTT broker"
echo "  3) server      — Remote server: Telegraf + InfluxDB + Grafana + Dashboard"
echo ""
read -rp "Select mode [1/2/3]: " mode_choice

case "$mode_choice" in
  1) DEPLOY_MODE="standalone" ;;
  2) DEPLOY_MODE="edge" ;;
  3) DEPLOY_MODE="server" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

# Create .env from template if it doesn't exist
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
  echo "Created .env from .env.example"
fi

# Update DEPLOY_MODE in .env
if grep -q '^DEPLOY_MODE=' "$PROJECT_DIR/.env"; then
  sed -i.bak "s/^DEPLOY_MODE=.*/DEPLOY_MODE=$DEPLOY_MODE/" "$PROJECT_DIR/.env"
  rm -f "$PROJECT_DIR/.env.bak"
else
  echo "DEPLOY_MODE=$DEPLOY_MODE" >> "$PROJECT_DIR/.env"
fi

# Edge-specific setup
if [ "$DEPLOY_MODE" = "edge" ]; then
  echo ""
  echo "--- Edge (Pi) Setup ---"
  echo ""
  read -rp "Enable MQTT authentication? (recommended) [Y/n]: " enable_auth
  enable_auth="${enable_auth:-Y}"

  if [[ "$enable_auth" =~ ^[Yy]$ ]]; then
    read -rp "MQTT username [telegraf]: " mqtt_user
    mqtt_user="${mqtt_user:-telegraf}"

    read -rsp "MQTT password: " mqtt_pass
    echo ""

    if [ -z "$mqtt_pass" ]; then
      echo "Error: password cannot be empty"
      exit 1
    fi

    # Generate password file
    "$SCRIPT_DIR/mqtt-password.sh" "$mqtt_user" "$mqtt_pass"

    # Switch to distributed Mosquitto config
    cp "$PROJECT_DIR/mosquitto/mosquitto-distributed.conf" "$PROJECT_DIR/mosquitto/mosquitto.conf"
    echo "Switched to distributed Mosquitto config (auth enabled)."
    echo ""
    echo "IMPORTANT — set these in the SERVER's .env file:"
    echo "  MQTT_HOST=<this Pi's IP address>"
    echo "  MQTT_USER=$mqtt_user"
    echo "  MQTT_PASSWORD=<the password you just entered>"
  else
    # Create empty password file so volume mount doesn't fail
    touch "$PROJECT_DIR/mosquitto/password_file"
    echo ""
    echo "WARNING: MQTT authentication disabled. Only use this on a trusted network."
  fi
fi

# Server-specific setup
if [ "$DEPLOY_MODE" = "server" ]; then
  echo ""
  echo "--- Server Setup ---"
  echo ""
  read -rp "Pi's IP address or hostname: " pi_host

  if [ -z "$pi_host" ]; then
    echo "Error: Pi host cannot be empty"
    exit 1
  fi

  read -rp "MQTT port [1884]: " mqtt_port
  mqtt_port="${mqtt_port:-1884}"

  # Update .env
  sed -i.bak "s/^MQTT_HOST=.*/MQTT_HOST=$pi_host/" "$PROJECT_DIR/.env"
  sed -i.bak "s/^MQTT_PORT=.*/MQTT_PORT=$mqtt_port/" "$PROJECT_DIR/.env"
  rm -f "$PROJECT_DIR/.env.bak"

  read -rp "MQTT username (leave empty if auth disabled on Pi): " mqtt_user
  if [ -n "$mqtt_user" ]; then
    read -rsp "MQTT password: " mqtt_pass
    echo ""
    # Set MQTT credentials in .env (handles both commented and uncommented lines)
    sed -i.bak "s/^#\{0,1\} \{0,1\}MQTT_USER=.*/MQTT_USER=$mqtt_user/" "$PROJECT_DIR/.env"
    sed -i.bak "s/^#\{0,1\} \{0,1\}MQTT_PASSWORD=.*/MQTT_PASSWORD=$mqtt_pass/" "$PROJECT_DIR/.env"
    rm -f "$PROJECT_DIR/.env.bak"
  fi

  echo ""
  echo "Server .env updated. Don't forget to also set:"
  echo "  INFLUXDB_TOKEN, INFLUXDB_USER, INFLUXDB_PASSWORD"
  echo "  GRAFANA_ADMIN_PASSWORD"
  echo "  CLOUDFLARE_TUNNEL_TOKEN (if using Cloudflare Tunnel)"
fi

echo ""
echo "Setup complete! Next steps:"
echo "  1. Review and edit .env with your values"
echo "  2. Start:  ./scripts/start.sh"
echo "  3. Verify: ./scripts/verify.sh"
