#!/usr/bin/env bash
# Scheduled runner invoked by macOS launchd (com.house.runner).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

mkdir -p "$REPO_DIR/data"

echo "================================================================"
echo "[house launchd] $(date -u '+%Y-%m-%dT%H:%M:%SZ') starting house run"

if [ ! -x "$REPO_DIR/.venv/bin/house" ]; then
  echo "[house launchd] ERROR: $REPO_DIR/.venv/bin/house not found or not executable" >&2
  exit 1
fi

"$REPO_DIR/.venv/bin/house" run
echo "[house launchd] $(date -u '+%Y-%m-%dT%H:%M:%SZ') finished"
