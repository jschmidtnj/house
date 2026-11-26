"""RentCast official REST API adapter (50 free requests/month at rentcast.io)."""

from __future__ import annotations

import logging
from typing import Any

import requests

from house.config import BudgetConfig, RentCastSourceConfig, SearchConfig
from house.models import ListingData
from house.sources.base import (
    ListingSource,
    normalize_amenities,
    normalize_property_type,
    parse_currency,
    parse_int,
)

logger = logging.getLogger(__name__)


def parse_rentcast_item(raw: dict[str, Any]) -> ListingData | None:
    """Parse a RentCast `/v1/listings/sale` JSON object into ListingData."""
    price = parse_currency(raw.get("price"))
    address = str(raw.get("addressLine1") or raw.get("formattedAddress") or "").strip()
    if not address or not price or price <= 0:
        return None

    ptype = normalize_property_type(raw.get("propertyType"))
    hoa_obj = raw.get("hoa")
    monthly_hoa = parse_currency(hoa_obj.get("fee") if isinstance(hoa_obj, dict) else hoa_obj)

    monthly_tax = None
    if raw.get("propertyTaxes"):
        # RentCast sometimes returns a dict keyed by year -> {"total": ...}
        taxes = raw["propertyTaxes"]
        if isinstance(taxes, dict) and taxes:
            latest_year = sorted(taxes.keys())[-1]
            annual = parse_currency(taxes[latest_year].get("total") if isinstance(taxes[latest_year], dict) else taxes[latest_year])
            if annual is not None:
                monthly_tax = round(annual / 12.0, 2)

    monthly_maint = None
    if ptype == "coop" and monthly_hoa is not None:
        monthly_maint = monthly_hoa
        monthly_hoa = None

    county = str(raw.get("county") or "").lower()
    borough = ""
    if "new york" in county:
        borough = "Manhattan"
    elif "kings" in county:
        borough = "Brooklyn"
    elif "queens" in county:
        borough = "Queens"
    elif "bronx" in county:
        borough = "Bronx"
    elif "richmond" in county:
        borough = "Staten Island"

    return ListingData(
        source="rentcast",
        external_id=str(raw.get("id") or address),
        address=address,
        unit=str(raw.get("addressLine2") or "").strip(),
        borough=borough,
        neighborhood=str(raw.get("subdivision") or raw.get("city") or "").strip(),
        zip_code=str(raw.get("zipCode") or "").strip(),
        property_type=ptype,
        price=price,
        beds=parse_currency(raw.get("bedrooms")) or 0.0,
        baths=parse_currency(raw.get("bathrooms")) or 0.0,
        sqft=parse_int(raw.get("squareFootage")),
        monthly_hoa=monthly_hoa,
        monthly_maintenance=monthly_maint,
        monthly_tax=monthly_tax,
        status=str(raw.get("status") or "active").lower(),
        days_on_market=parse_int(raw.get("daysOnMarket")),
        url="",
        amenities=normalize_amenities([], str(raw.get("description") or "")),
        description=str(raw.get("description") or ""),
        raw_json=raw,
    )


class RentCastSource(ListingSource):
    """Fetch active NYC sale listings via the official RentCast API."""

    name = "rentcast"
    ENDPOINT = "https://api.rentcast.io/v1/listings/sale"

    def __init__(
        self,
        api_key: str,
        source_cfg: RentCastSourceConfig,
        budget: BudgetConfig,
        search: SearchConfig,
    ) -> None:
        self.api_key = api_key
        self.source_cfg = source_cfg
        self.budget = budget
        self.search = search

    def fetch(self) -> list[ListingData]:
        if not self.api_key:
            logger.info("Skipping %s: RENTCAST_API_KEY not set in .env", self.name)
            return []

        headers = {"X-Api-Key": self.api_key, "Accept": "application/json"}
        queries: list[dict[str, Any]] = []
        if self.source_cfg.zip_codes:
            for z in self.source_cfg.zip_codes:
                queries.append({"zipCode": z, "status": "Active", "limit": self.source_cfg.limit})
        else:
            queries.append(
                {
                    "city": self.source_cfg.city,
                    "state": self.source_cfg.state,
                    "status": "Active",
                    "limit": self.source_cfg.limit,
                }
            )

        results: list[ListingData] = []
        for params in queries:
            try:
                resp = requests.get(self.ENDPOINT, headers=headers, params=params, timeout=20)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:
                logger.error("RentCast request failed (%s): %s", params, exc)
                continue

            if isinstance(payload, list):
                for raw in payload:
                    if isinstance(raw, dict):
                        parsed = parse_rentcast_item(raw)
                        if parsed is not None and parsed.price <= self.budget.max_price:
                            results.append(parsed)
        return results
