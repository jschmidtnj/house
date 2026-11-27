#!/usr/bin/env bash
# Unload and remove the com.house.runner and com.house.web macOS LaunchAgents.
set -euo pipefail

UID_NUM="$(id -u)"

for LABEL in com.house.runner com.house.web; do
  DEST_PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
  launchctl bootout "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
  rm -f "$DEST_PLIST"
  echo "Unloaded and removed ${LABEL} (${DEST_PLIST})"
done
