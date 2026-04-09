#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PWFILE="$PROJECT_DIR/mosquitto/password_file"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <username> [password]"
  echo ""
  echo "Creates or updates an MQTT user in the Mosquitto password file."
  echo "If password is omitted, you will be prompted."
  exit 1
fi

USERNAME="$1"
PASSWORD="${2:-}"

if [ -z "$PASSWORD" ]; then
  read -rsp "Password for $USERNAME: " PASSWORD
  echo ""
fi

if [ -f "$PWFILE" ]; then
  # Update existing file
  docker run --rm -v "$PROJECT_DIR/mosquitto:/mosquitto/config" \
    eclipse-mosquitto:2 \
    mosquitto_passwd -b /mosquitto/config/password_file "$USERNAME" "$PASSWORD"
  echo "Updated password for user '$USERNAME'."
else
  # Create new file
  docker run --rm -v "$PROJECT_DIR/mosquitto:/mosquitto/config" \
    eclipse-mosquitto:2 \
    mosquitto_passwd -c -b /mosquitto/config/password_file "$USERNAME" "$PASSWORD"
  echo "Created password file with user '$USERNAME'."
fi

# Fix permissions — mosquitto_passwd runs as root inside Docker, creating
# a root-owned file. The Mosquitto container runs as user mosquitto (UID
# 1883) and needs to read it. May require sudo if Docker runs as root.
if [ -w "$PWFILE" ]; then
  chmod 644 "$PWFILE"
else
  sudo chmod 644 "$PWFILE"
fi

echo ""
echo "Remember to:"
echo "  1. Set MQTT_USER=$USERNAME and MQTT_PASSWORD=<password> in the server's .env"
echo "  2. Restart Mosquitto: ./scripts/stop.sh && ./scripts/start.sh"
