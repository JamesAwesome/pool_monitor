#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source .env to get DEPLOY_MODE
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

DEPLOY_MODE="${DEPLOY_MODE:-standalone}"

echo "Starting pool monitor in '$DEPLOY_MODE' mode..."
if [ -z "${WEATHERAPI_KEY:-}" ]; then
  docker compose --project-directory "$PROJECT_DIR" --profile "$DEPLOY_MODE" up -d --scale weather=0 "$@"
else
  docker compose --project-directory "$PROJECT_DIR" --profile "$DEPLOY_MODE" up -d "$@"
fi
