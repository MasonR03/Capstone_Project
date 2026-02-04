#!/usr/bin/env bash
set -euo pipefail

# Resets the docker-compose Postgres volume on host reboot, then brings the stack back up.
# Intended for ephemeral/dev environments only (this deletes all persisted player stats).

STACK_NAME="${1:-capstone-app-dev}"
APP_DIR="${ORBITFALL_DIR:-$HOME/orbitfall}"

cd "$APP_DIR"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "[reboot-reset] Waiting for Docker daemon..."
for i in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker info >/dev/null 2>&1; then
  echo "[reboot-reset] Docker not ready after timeout; exiting."
  exit 0
fi

echo "[reboot-reset] Resetting DB volume for stack: $STACK_NAME"
compose -p "$STACK_NAME" down -v || true
compose -p "$STACK_NAME" up -d --no-build

echo "[reboot-reset] Done."

