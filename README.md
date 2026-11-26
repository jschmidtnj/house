# house

NYC apartment hunting & monthly-cost optimization bot inspired by `autotrade`, backed by **SQLAlchemy 2.0 ORM** (SQLite by default, Postgres-ready), modular YAML configuration, pluggable free/nearly-free listing adapters, and **Discord** webhook alerts.

## Key Features

- **NYC-Accurate Monthly Cost Engine (`src/house/finance.py`)**
  - Handles **Condo** (Mortgage P&I + Common Charges + Monthly Property Tax + Insurance) vs. **Co-op** (Mortgage P&I + Maintenance, avoiding double-counting bundled property taxes) vs. **Townhouse**.
  - Estimates NYC **Mansion Tax** (1%+ at \$1M+), **Mortgage Recording Tax** (condos/townhouses), total cash-to-close, and rough after-tax effective monthly cost.
  - Every knob (`--max-monthly`, `--max-price`, `--rate`, `--down`, `--max-cash`, `--term`) can be tuned in `config/budget.yaml` or overridden ad-hoc on the CLI.
- **Pluggable Free / Nearly-Free Listing Sources (`src/house/sources/`)**
  - `homeharvest`: Free, unlimited Realtor.com / MLS listings by NYC borough or zip code (no API key needed; installed via `pip install -e ".[live]"`).
  - `local_import`: Drop JSON/CSV exports into `data/imports/` (see `prompts/streeteasy_export.md` for a ready-to-paste Gemini-in-Chrome prompt — 100% free, zero anti-bot friction).
  - `email_alerts`: Free IMAP reader for StreetEasy, Redfin, Zillow, and Compass saved-search alert emails.
  - `rapidapi_streeteasy`: RapidAPI StreetEasy wrapper (*NYC Real Estate API*, free basic tier).
  - `rentcast`: Official RentCast REST API (50 free calls/month).
  - `synthetic`: Built-in realistic NYC condo/co-op test dataset for offline testing and knob tuning.
- **Cross-Site Deduplication & Price-Drop Tracking (`src/house/db.py`)**
  - Normalizes NYC addresses & unit numbers so the same apartment across sites merges into one listing with full `price_history`.
- **Quiet, Deduplicated Discord Alerts (`src/house/notify/discord.py`)**
  - Rich embeds for new matching listings and price drops, deduplicated in SQLite.

## Setup (`pyenv`)

```bash
# Create and activate a dedicated Python 3.12 virtualenv
pyenv virtualenv 3.12.16 house
pyenv local house

# Install package + live HomeHarvest adapter + dev dependencies
pip install -e ".[live,dev]"

# Copy env template and add your Discord webhook / optional free API keys
cp .env.example .env
```

## Quick Commands

```bash
# Poll live NYC listings via HomeHarvest (Manhattan & Brooklyn)
house poll
house rank
house rank --max-monthly 8000 --rate 6.25 --down 25
house show 1

# Or test offline with synthetic NYC listings
house poll --synthetic

# Import a local StreetEasy/Redfin JSON or CSV export
house import-file data/imports/streeteasy_2026-11-25.json

# Periodic all-in-one run (poll -> rank -> Discord notify, with cadence lock)
house run
house run --force --no-notify

# Utilities
house status
house test-discord
```

## Periodic Scheduling (macOS `cron` / `launchd`)

Because `house run` includes a file lock and cadence guardrails (`config/default.yaml`), you can safely run it on a schedule:

```cron
0 */6 * * * cd /Users/joshua/Desktop/house && /Users/joshua/.pyenv/versions/house/bin/house run >> data/cron.log 2>&1
```

## Testing

```bash
pytest -v
```
