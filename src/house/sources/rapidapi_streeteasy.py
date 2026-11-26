"""RapidAPI StreetEasy wrapper adapter ('NYC Real Estate API' / streeteasy-api)."""

from __future__ import annotations

import logging
from typing import Any

import requests

from house.config import BudgetConfig, RapidAPIStreetEasyConfig, SearchConfig
from house.models import ListingData
from house.sources.base import (
    ListingSource,
    normalize_amenities,
    normalize_property_type,
    parse_currency,
    parse_int,
)

logger = logging.getLogger(__name__)


def parse_streeteasy_item(raw: dict[str, Any]) -> ListingData | None:
    """Parse a single listing record from RapidAPI StreetEasy JSON into ListingData."""
    price = parse_currency(raw.get("price"))
    address = str(raw.get("address") or raw.get("street") or "").strip()
    if not address or not price or price <= 0:
        return None

    ptype = normalize_property_type(raw.get("propertyType") or raw.get("property_type") or raw.get("type"))
    monthly_hoa = parse_currency(raw.get("monthlyHoa") or raw.get("commonCharges") or raw.get("hoa"))
    monthly_maint = parse_currency(raw.get("monthlyMaintenance") or raw.get("maintenance"))
    monthly_tax = parse_currency(raw.get("monthlyTax") or raw.get("taxes"))

    # StreetEasy APIs sometimes put co-op maintenance in monthlyHoa
    if ptype == "coop" and monthly_maint is None and monthly_hoa is not None:
        monthly_maint = monthly_hoa
        monthly_hoa = None

    url = str(raw.get("url") or raw.get("listingUrl") or "").strip()
    if url and url.startswith("/"):
        url = f"https://streeteasy.com{url}"

    description = str(raw.get("description") or "")
    amenities = normalize_amenities(raw.get("amenities"), description)

    return ListingData(
        source="streeteasy_rapidapi",
        external_id=str(raw.get("id") or raw.get("listingId") or address),
        address=address,
        unit=str(raw.get("unit") or "").strip(),
        borough=str(raw.get("borough") or "").strip(),
        neighborhood=str(raw.get("neighborhood") or raw.get("areaName") or "").strip(),
        zip_code=str(raw.get("zipcode") or raw.get("zip") or "").strip(),
        property_type=ptype,
        price=price,
        beds=parse_currency(raw.get("bedrooms") or raw.get("beds")) or 0.0,
        baths=parse_currency(raw.get("bathrooms") or raw.get("baths")) or 0.0,
        sqft=parse_int(raw.get("sqft") or raw.get("livingArea")),
        monthly_hoa=monthly_hoa,
        monthly_maintenance=monthly_maint,
        monthly_tax=monthly_tax,
        status=str(raw.get("status") or "active").lower(),
        days_on_market=parse_int(raw.get("daysOnMarket") or raw.get("days_on_market")),
        url=url,
        amenities=amenities,
        description=description,
        raw_json=raw,
    )


class RapidAPIStreetEasySource(ListingSource):
    """Fetch NYC for-sale listings from StreetEasy via RapidAPI (free tier friendly)."""

    name = "streeteasy_rapidapi"

    def __init__(
        self,
        api_key: str,
        host: str,
        source_cfg: RapidAPIStreetEasyConfig,
        budget: BudgetConfig,
        search: SearchConfig,
    ) -> None:
        self.api_key = api_key
        self.host = host
        self.source_cfg = source_cfg
        self.budget = budget
        self.search = search

    def fetch(self) -> list[ListingData]:
        if not self.api_key:
            logger.info("Skipping %s: RAPIDAPI_KEY not set in .env", self.name)
            return []

        areas = self.source_cfg.areas or ["manhattan"]
        headers = {
            "X-RapidAPI-Key": self.api_key,
            "X-RapidAPI-Host": self.host,
        }
        url = f"https://{self.host}/sales/search"
        results: list[ListingData] = []

        # Batch areas in a single comma-separated call where supported to conserve free-tier quota
        params: dict[str, Any] = {
            "areas": ",".join(areas),
            "maxPrice": int(self.budget.max_price),
            "minBeds": int(self.search.min_beds),
            "limit": min(100, self.source_cfg.limit_per_area * max(1, len(areas))),
            "offset": 0,
        }
        if self.budget.min_price > 0:
            params["minPrice"] = int(self.budget.min_price)

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=20)
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            logger.error("RapidAPI StreetEasy request failed: %s", exc)
            return []

        raw_items = payload if isinstance(payload, list) else payload.get("listings", payload.get("results", []))
        for raw in raw_items:
            if isinstance(raw, dict):
                parsed = parse_streeteasy_item(raw)
                if parsed is not None:
                    results.append(parsed)
        return results
