"""Configuration loader combining modular YAML files and .env secrets."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv


@dataclass
class SchedulerConfig:
    min_interval_minutes: int = 55
    poll_interval_minutes: int = 360


@dataclass
class BudgetConfig:
    annual_income: float | None = 300_000.0
    max_price: float = 2_000_000.0
    min_price: float = 0.0
    max_monthly_cost: float = 7_000.0
    coop_max_dti_pct: float = 28.0
    condo_max_dti_pct: float = 36.0
    down_payment_pct: float = 20.0
    max_cash_down: float | None = None
    interest_rate_pct: float = 6.50
    loan_term_years: int = 30
    monthly_insurance_default: float = 150.0
    fallback_condo_tax_rate_pct: float = 0.90
    fallback_coop_maint_per_sqft: float = 2.25
    max_monthly_fees_ratio: float = 0.40
    coop_min_down_pct: float = 20.0
    use_after_tax_for_filter: bool = False
    marginal_tax_rate_pct: float = 42.0
    coop_tax_deductible_pct: float = 0.45


@dataclass
class SearchConfig:
    boroughs: list[str] = field(default_factory=list)
    neighborhoods: list[str] = field(default_factory=list)
    zip_codes: list[str] = field(default_factory=list)
    property_types: list[str] = field(default_factory=lambda: ["condo", "coop", "condop"])
    exclude_hdfc: bool = True
    exclude_land_lease: bool = False
    min_beds: float = 1.0
    min_baths: float = 1.0
    min_sqft: int = 0
    preferred_amenities: list[str] = field(default_factory=list)
    required_amenities: list[str] = field(default_factory=list)
    min_score_to_notify: float = 55.0
    price_drop_notify_pct: float = 3.0
    target_price_per_sqft: float = 1400.0
    weights: dict[str, float] = field(
        default_factory=lambda: {
            "monthly_headroom": 0.35,
            "price_per_sqft": 0.25,
            "size_fit": 0.15,
            "amenities": 0.15,
            "price_drop": 0.10,
        }
    )


@dataclass
class HomeHarvestSourceConfig:
    enabled: bool = True
    locations: list[str] = field(default_factory=lambda: ["Manhattan, NY", "Brooklyn, NY"])
    past_days: int = 7
    limit: int = 100
    extra_property_data: bool = True


@dataclass
class LocalImportSourceConfig:
    enabled: bool = True
    import_dir: str = "data/imports"


@dataclass
class EmailAlertsSourceConfig:
    enabled: bool = False
    sender_filters: list[str] = field(
        default_factory=lambda: ["streeteasy.com", "redfin.com", "zillow.com", "compass.com"]
    )
    max_emails_per_poll: int = 50


@dataclass
class RapidAPIStreetEasyConfig:
    enabled: bool = False
    areas: list[str] = field(default_factory=list)
    limit_per_area: int = 25


@dataclass
class RentCastSourceConfig:
    enabled: bool = False
    city: str = "New York"
    state: str = "NY"
    zip_codes: list[str] = field(default_factory=list)
    limit: int = 50


@dataclass
class SourcesConfig:
    homeharvest: HomeHarvestSourceConfig = field(default_factory=HomeHarvestSourceConfig)
    local_import: LocalImportSourceConfig = field(default_factory=LocalImportSourceConfig)
    email_alerts: EmailAlertsSourceConfig = field(default_factory=EmailAlertsSourceConfig)
    rapidapi_streeteasy: RapidAPIStreetEasyConfig = field(default_factory=RapidAPIStreetEasyConfig)
    rentcast: RentCastSourceConfig = field(default_factory=RentCastSourceConfig)


@dataclass
class EnvSecrets:
    discord_webhook_url: str = ""
    rapidapi_key: str = ""
    rapidapi_streeteasy_host: str = "streeteasy-api.p.rapidapi.com"
    rentcast_api_key: str = ""
    imap_host: str = "imap.gmail.com"
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_folder: str = "INBOX"


@dataclass
class AppConfig:
    database_path: str = "data/house.db"
    scheduler: SchedulerConfig = field(default_factory=SchedulerConfig)
    budget: BudgetConfig = field(default_factory=BudgetConfig)
    search: SearchConfig = field(default_factory=SearchConfig)
    sources: SourcesConfig = field(default_factory=SourcesConfig)
    secrets: EnvSecrets = field(default_factory=EnvSecrets)


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(merged.get(k), dict):
            merged[k] = _deep_merge(merged[k], v)
        else:
            merged[k] = v
    return merged


def _load_yaml_with_includes(path: Path) -> dict[str, Any]:
    """Load YAML config and resolve optional `includes:` mapping."""
    raw = _load_yaml(path)
    includes = raw.get("includes")
    if not isinstance(includes, dict):
        return raw

    merged: dict[str, Any] = {}
    for section, rel_file in includes.items():
        inc_path = path.parent / str(rel_file)
        inc_data = _load_yaml(inc_path)
        if section in inc_data and isinstance(inc_data[section], dict) and len(inc_data) == 1:
            merged[section] = inc_data[section]
        else:
            merged[section] = inc_data

    overrides = {k: v for k, v in raw.items() if k != "includes"}
    return _deep_merge(merged, overrides)


def _apply_fields(dc_obj: Any, data: dict[str, Any] | None) -> None:
    if not isinstance(data, dict):
        return
    for key, val in data.items():
        if hasattr(dc_obj, key) and val is not None:
            setattr(dc_obj, key, val)


def load_config(config_path: str | Path = "config/default.yaml") -> AppConfig:
    """Load AppConfig from modular YAML files plus environment variables (.env)."""
    load_dotenv(override=False)

    path = Path(config_path)
    raw = _load_yaml_with_includes(path) if path.exists() else {}

    cfg = AppConfig()
    db_raw = raw.get("database", {})
    if isinstance(db_raw, dict) and db_raw.get("path"):
        cfg.database_path = str(db_raw["path"])

    _apply_fields(cfg.scheduler, raw.get("scheduler"))
    _apply_fields(cfg.budget, raw.get("budget"))
    _apply_fields(cfg.search, raw.get("search"))

    sources_raw = raw.get("sources", {})
    if isinstance(sources_raw, dict):
        _apply_fields(cfg.sources.homeharvest, sources_raw.get("homeharvest"))
        _apply_fields(cfg.sources.local_import, sources_raw.get("local_import"))
        _apply_fields(cfg.sources.email_alerts, sources_raw.get("email_alerts"))
        _apply_fields(cfg.sources.rapidapi_streeteasy, sources_raw.get("rapidapi_streeteasy"))
        _apply_fields(cfg.sources.rentcast, sources_raw.get("rentcast"))

    cfg.secrets = EnvSecrets(
        discord_webhook_url=os.getenv("DISCORD_WEBHOOK_URL", "").strip(),
        rapidapi_key=os.getenv("RAPIDAPI_KEY", "").strip(),
        rapidapi_streeteasy_host=os.getenv(
            "RAPIDAPI_STREETEASY_HOST", "streeteasy-api.p.rapidapi.com"
        ).strip(),
        rentcast_api_key=os.getenv("RENTCAST_API_KEY", "").strip(),
        imap_host=os.getenv("IMAP_HOST", "imap.gmail.com").strip(),
        imap_port=int(os.getenv("IMAP_PORT", "993")),
        imap_user=os.getenv("IMAP_USER", "").strip(),
        imap_password=os.getenv("IMAP_PASSWORD", "").strip(),
        imap_folder=os.getenv("IMAP_FOLDER", "INBOX").strip(),
    )

    return cfg
