# macOS `launchd` Services

- **`com.house.runner`** — Runs `house run` (poll → rank → smart Discord alerts) automatically every **6 hours** (4×/day), matching `poll_interval_minutes: 360` in `config/default.yaml`.
- **`com.house.web`** — Keeps the interactive Web UI running at `http://127.0.0.1:8000` (`RunAtLoad` + `KeepAlive`).

## Files
- `com.house.runner.plist` — Scheduled runner LaunchAgent template (`__REPO_DIR__` is replaced on install)
- `com.house.web.plist` — Always-on Web UI LaunchAgent template (port `8000`)
- `run.sh` — Wrapper script invoked by `com.house.runner`
- `install.sh` — Renders and loads both LaunchAgents into `~/Library/LaunchAgents/`
- `uninstall.sh` — Unloads and removes both LaunchAgents

## Usage

```bash
# 1. (First time only) Seed baseline alerts so existing listings don't spam Discord
.venv/bin/house alerts seed

# 2. Install & start both LaunchAgents (runner + web UI on :8000)
./launchd/install.sh

# Check status
launchctl print gui/$(id -u)/com.house.runner | head -n 30
launchctl print gui/$(id -u)/com.house.web | head -n 30

# Trigger a poll run immediately
launchctl kickstart -k gui/$(id -u)/com.house.runner

# Restart the Web UI
launchctl kickstart -k gui/$(id -u)/com.house.web

# Tail logs
tail -f data/launchd.log data/launchd.err.log
tail -f data/launchd-web.log data/launchd-web.err.log

# Stop & remove both
./launchd/uninstall.sh
```
