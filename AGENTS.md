# AGENTS.md

Guide for AI agents working on **house**.

## Project Overview

`house` is a Python NYC apartment hunting and monthly-cost optimization bot modeled after `autotrade`, powered by **SQLAlchemy 2.0 ORM** (SQLite by default, Postgres-ready), modular YAML config (`config/`), pluggable listing adapters (`src/house/sources/`), and **Discord** webhook notifications.

## Critical Guardrails

- **Privacy & Secrets:** Never commit `.env`, `data/*.db`, `data/imports/*.json`, `data/imports/*.csv`, or `data/imports/*.yaml` (all are gitignored). Never log or expose Discord webhook URLs, API keys, or IMAP credentials.
- **NYC Co-op vs. Condo Math:** Co-op monthly `maintenance` already includes building property taxes — never double-count `monthly_tax` on `property_type == "coop"`. Condos/townhouses have separate `monthly_hoa` + `monthly_tax` and pay NYC Mortgage Recording Tax at closing.
- **No Anti-Bot Bypassing:** Do not add scrapers that defeat CAPTCHAs or PerimeterX/Cloudflare challenges. Keep ingestion on official/wrapper APIs (`rapidapi_streeteasy`, `rentcast`), free IMAP saved-search emails (`email_alerts`), or local exports (`local_import`).
- **Keep Frameworks Idiomatic:** Use **SQLAlchemy 2.0 ORM** in `src/house/db.py` (no raw SQLite queries).
- **Offline Tests:** Always run `pytest -v` after edits and keep all tests passing offline without network access.

## Codebase Map

- `config/` — Modular YAML configuration: `default.yaml` (entry point + `includes`), `budget.yaml` (monthly-cost knobs & mortgage assumptions), `search.yaml` (neighborhoods, beds/baths/sqft, amenities, scoring weights), `sources.yaml` (enabled adapters).
- `src/house/config.py` — YAML + `.env` loader (`AppConfig`).
- `src/house/models.py` — `ListingData`, `CostBreakdown`, `ScoredListing`.
- `src/house/db.py` — SQLAlchemy 2.0 ORM (`Listing`, `PriceHistory`, `AlertRecord`, `BotState`), `make_canonical_key`, and `Database`.
- `src/house/finance.py` — NYC mortgage P&I, condo vs. co-op monthly cost, NYC mansion tax & closing cost estimator.
- `src/house/scoring.py` — Hard-filter and weighted 0–100 composite ranking engine.
- `src/house/sources/` — `ListingSource` ABC + `homeharvest`, `synthetic`, `local_import`, `email_alerts`, `rapidapi_streeteasy`, `rentcast`.
- `src/house/notify/discord.py` — Discord webhook embeds with SQLite deduplication.
- `src/house/cli.py` — CLI entry point (`house`).
- `prompts/streeteasy_export.md` — Ready-to-paste Gemini-in-Chrome prompt for free listing exports.
- `tests/` — Offline pytest suite.
