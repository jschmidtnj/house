# house

NYC, Jersey City, and Hoboken apartment-hunting & monthly-cost optimization bot inspired by `autotrade`, powered by **SQLAlchemy 2.0 ORM** (SQLite by default, Postgres-ready), modular YAML configuration, pluggable free/nearly-free listing adapters, **Discord** webhook alerts, and an interactive **FastAPI + React/Leaflet** Web UI.

## Key Features

- **NYC/NJ Monthly Cost & House-Hacking Engine (`src/house/finance.py`)**
  - Models **Condo** (Mortgage P&I + Common Charges + Property Tax + Insurance), **Co-op** (Mortgage P&I + Maintenance without double-counting taxes, plus 28% NYC Co-op board DTI checks), and **2–3 Unit Townhouses / Multi-family** (Tax Class 1 defaults + configurable net rental income offset for extra units).
  - Estimates NYC **Mansion Tax**, **Mortgage Recording Tax**, cash-to-close, front-end **DTI %**, and rough after-tax monthly cost.
- **Offline NYC Subway & PATH Commute Scoring (`src/house/transit.py`)**
  - Uses cached official **MTA Subway + PATH** station coordinates (`web/public/data/nyc_subways.json`) to estimate door-to-door minutes to Midtown Manhattan and filter NJ listings by walking time to PATH.
- **Interactive Web UI (`src/house/web/api.py` + `web/`)**
  - Dark minimalist **Leaflet** map with NYC real-estate neighborhood polygons, colored MTA Subway & PATH lines/stations, live budget/commute/rental-offset sliders, **Favorites & Custom Lists** (SQLite-persisted), `?listing=<id>` deep links, side-by-side comparison bar, Recharts value-frontier analytics, and mobile-responsive layout.
- **Pluggable Free / Nearly-Free Listing Sources (`src/house/sources/`)**
  - `homeharvest`: Free, unlimited Realtor.com / MLS listings across your target zip codes (no API key required).
  - `local_import`: Drop JSON/CSV exports into `data/imports/` (see `prompts/streeteasy_export.md`).
  - `email_alerts`: Free IMAP reader for StreetEasy, Redfin, Zillow, and Compass saved-search emails.
  - `rapidapi_streeteasy` / `rentcast`: Optional free-tier API adapters.
  - `synthetic`: Offline realistic NYC dataset for testing.

---

## Setup

### 1. Python Environment
```bash
cd /Users/joshua/Desktop/house

# Create local Python 3.12 virtualenv (or use pyenv virtualenv)
python3 -m venv .venv
source .venv/bin/activate

# Install core + HomeHarvest live scraper + FastAPI web UI + dev/test deps
pip install -e ".[live,web,dev]"

# Copy environment template (optional: add DISCORD_WEBHOOK_URL, API keys, or IMAP creds)
cp .env.example .env
```

### 2. Frontend Build (for the Web UI)
```bash
pnpm --dir web install
pnpm --dir web build
```

---

## Running the Web UI

### Production / Everyday Mode (Single Process)
```bash
.venv/bin/house web --host 127.0.0.1 --port 8000
```
Then open **http://127.0.0.1:8000** in your browser.

### View on Phone / Other Devices on the Same Wi-Fi
Bind the server to `0.0.0.0`:
```bash
.venv/bin/house web --host 0.0.0.0 --port 8000
```
Find your Mac's local IP address:
```bash
ipconfig getifaddr en0
```
Then open `http://<YOUR-MAC-IP>:8000` (or `http://<your-mac-name>.local:8000`) from any phone or laptop on the same Wi-Fi network. *(If macOS Firewall prompts for incoming Python connections, click **Allow**).*

#### Optional: Publish a Custom `house.local` Alias (`dns-sd`)
To access the app at **http://house.local:8000** from any device on your Wi-Fi without renaming your Mac, run this in a separate terminal (keep it running while you want the alias active):
```bash
dns-sd -P house _http._tcp local 8000 house.local "$(ipconfig getifaddr en0)"
```
*(Or check your Mac's built-in `.local` name with `scutil --get LocalHostName` and use `http://<name>.local:8000` without running `dns-sd`).*

### Frontend Development Mode (Hot Reload)
Run the FastAPI backend in one terminal and Vite in another:
```bash
# Terminal 1 (API on port 8000)
.venv/bin/house web --host 127.0.0.1 --port 8000

# Terminal 2 (Vite dev server on port 5173, proxies /api -> 8000)
pnpm --dir web dev
```

---

## CLI Usage

```bash
# Poll live listings across all configured NYC, Jersey City & Hoboken zip codes
.venv/bin/house poll

# Rank stored listings using config/budget.yaml & config/search.yaml
.venv/bin/house rank

# Override budget & search knobs on the fly
.venv/bin/house rank --max-monthly 7500 --rate 6.25 --down 25 --min-beds 2
.venv/bin/house rank --type multifamily,townhouse --max-monthly 7000

# Inspect full monthly breakdown, cash-to-close, and price history for a listing ID
.venv/bin/house show 217

# Periodic all-in-one cycle (poll -> rank -> deduplicated Discord alerts, with cadence lock)
.venv/bin/house run
.venv/bin/house run --force --no-notify

# Offline synthetic test run
.venv/bin/house poll --synthetic

# Import a local StreetEasy/Redfin JSON or CSV export
.venv/bin/house import-file data/imports/streeteasy_2026-11-26.json

# Utilities
.venv/bin/house status
.venv/bin/house test-discord
```

---

## Configuration

All knobs live in modular YAML files under `config/`:
- [`config/default.yaml`](config/default.yaml) — SQLite path and polling cadence guardrails.
- [`config/budget.yaml`](config/budget.yaml) — Salary (`annual_income`), `max_monthly_cost`, `max_price`, down payment %, interest rate, DTI caps, and 2–3 unit townhouse rental offset assumptions.
- [`config/search.yaml`](config/search.yaml) — Target boroughs, neighborhoods, zip codes, property types, HDFC exclusion, `max_commute_minutes`, `nj_max_walk_to_path_min`, and scoring weights.
- [`config/sources.yaml`](config/sources.yaml) — Enabled listing adapters and target zip codes for HomeHarvest.

---

## Periodic Scheduling (`cron`)

Because `house run` includes a file lock and cadence guardrails (`config/default.yaml`), you can safely schedule it (e.g., every 6 hours):

```cron
0 */6 * * * cd /Users/joshua/Desktop/house && /Users/joshua/Desktop/house/.venv/bin/house run >> data/cron.log 2>&1
```

## Testing

```bash
.venv/bin/pytest -v
pnpm --dir web typecheck
```
