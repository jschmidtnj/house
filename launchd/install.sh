#!/usr/bin/env bash
# Install and load the com.house.runner and com.house.web macOS LaunchAgents for the current repo path.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

chmod +x "$REPO_DIR/launchd/run.sh"
mkdir -p "$DEST_DIR" "$REPO_DIR/data"

install_agent() {
  local label="$1"
  local src_plist="$REPO_DIR/launchd/${label}.plist"
  local dest_plist="$DEST_DIR/${label}.plist"

  # Render plist with this machine's absolute repo path
  sed "s|__REPO_DIR__|${REPO_DIR}|g" "$src_plist" > "$dest_plist"
  plutil -lint "$dest_plist"

  # Reload cleanly if already installed
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/${UID_NUM}" "$dest_plist"
  launchctl enable "gui/${UID_NUM}/${label}"

  echo "Installed and loaded ${label} -> ${dest_plist}"
}

install_agent "com.house.runner"
install_agent "com.house.web"

echo "Runner schedule: every 6 hours (StartInterval=21600) | Logs: ${REPO_DIR}/data/launchd.log"
echo "Web UI:          http://127.0.0.1:8000 (KeepAlive)   | Logs: ${REPO_DIR}/data/launchd-web.log"
