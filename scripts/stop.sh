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

echo "Stopping pool monitor ($DEPLOY_MODE mode)..."
docker compose --project-directory "$PROJECT_DIR" --profile "$DEPLOY_MODE" down "$@"
