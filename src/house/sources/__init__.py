"""Listing source registry and multi-source polling orchestration."""

from __future__ import annotations

from dataclasses import dataclass

from house.config import AppConfig
from house.models import ListingData
from house.sources.base import ListingSource
from house.sources.email_alerts import EmailAlertsSource
from house.sources.homeharvest_source import HomeHarvestSource
from house.sources.local_import import LocalImportSource
from house.sources.rapidapi_streeteasy import RapidAPIStreetEasySource
from house.sources.rentcast import RentCastSource
from house.sources.synthetic import SyntheticNYCSource


@dataclass
class ReconcileScope:
    """Safe reconciliation bounds reported by a polled source."""

    complete_zips: set[str] | None = None
    max_days_on_market: int | None = None


def build_enabled_sources(config: AppConfig, *, synthetic: bool = False) -> list[ListingSource]:
    """Instantiate all enabled listing adapters from AppConfig."""
    if synthetic:
        return [SyntheticNYCSource()]

    sources: list[ListingSource] = []
    if config.sources.homeharvest.enabled:
        sources.append(
            HomeHarvestSource(
                source_cfg=config.sources.homeharvest,
                budget=config.budget,
                search=config.search,
            )
        )
    if config.sources.local_import.enabled:
        sources.append(LocalImportSource(config.sources.local_import.import_dir))
    if config.sources.email_alerts.enabled:
        sources.append(EmailAlertsSource(config.secrets, config.sources.email_alerts))
    if config.sources.rapidapi_streeteasy.enabled:
        sources.append(
            RapidAPIStreetEasySource(
                api_key=config.secrets.rapidapi_key,
                host=config.secrets.rapidapi_streeteasy_host,
                source_cfg=config.sources.rapidapi_streeteasy,
                budget=config.budget,
                search=config.search,
            )
        )
    if config.sources.rentcast.enabled:
        sources.append(
            RentCastSource(
                api_key=config.secrets.rentcast_api_key,
                source_cfg=config.sources.rentcast,
                budget=config.budget,
                search=config.search,
            )
        )
    return sources


def poll_all_sources_with_scopes(
    config: AppConfig,
    *,
    synthetic: bool = False,
) -> tuple[list[ListingData], dict[str, int], dict[str, ReconcileScope]]:
    """Run all enabled sources and return `(listings, counts_by_source, reconcile_scopes)`."""
    adapters = build_enabled_sources(config, synthetic=synthetic)
    all_items: list[ListingData] = []
    counts: dict[str, int] = {}
    scopes: dict[str, ReconcileScope] = {}
    for adapter in adapters:
        fetched = adapter.fetch()
        counts[adapter.name] = len(fetched)
        all_items.extend(fetched)
        if isinstance(adapter, HomeHarvestSource):
            scopes[adapter.name] = ReconcileScope(
                complete_zips=set(adapter.complete_zips),
                max_days_on_market=adapter.source_cfg.past_days,
            )
    return all_items, counts, scopes


def poll_all_sources(
    config: AppConfig,
    *,
    synthetic: bool = False,
) -> tuple[list[ListingData], dict[str, int]]:
    """Run all enabled sources and return `(listings, counts_by_source)`."""
    all_items, counts, _ = poll_all_sources_with_scopes(config, synthetic=synthetic)
    return all_items, counts
