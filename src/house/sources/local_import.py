"""Local CSV/JSON file importer for zero-cost listing ingestion from data/imports/."""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Any

from house.models import ListingData
from house.sources.base import (
    ListingSource,
    normalize_amenities,
    normalize_property_type,
    parse_currency,
    parse_int,
)

logger = logging.getLogger(__name__)


def parse_listing_dict(raw: dict[str, Any], source: str = "local_import") -> ListingData | None:
    """Convert a flexible JSON/CSV dict into a normalized ListingData."""
    price = parse_currency(raw.get("price") or raw.get("asking_price") or raw.get("list_price"))
    address = str(raw.get("address") or raw.get("street_address") or "").strip()
    if not address or not price or price <= 0:
        return None

    ptype = normalize_property_type(raw.get("property_type") or raw.get("type") or raw.get("home_type"))
    monthly_hoa = parse_currency(
        raw.get("monthly_hoa") or raw.get("common_charges") or raw.get("hoa")
    )
    monthly_maint = parse_currency(
        raw.get("monthly_maintenance") or raw.get("maintenance")
    )
    monthly_tax = parse_currency(
        raw.get("monthly_tax") or raw.get("taxes") or raw.get("monthly_taxes")
    )
    if monthly_tax is None and raw.get("annual_tax") is not None:
        annual = parse_currency(raw.get("annual_tax"))
        if annual is not None:
            monthly_tax = round(annual / 12.0, 2)

    raw_amenities = raw.get("amenities")
    if isinstance(raw_amenities, str):
        raw_amenities = [a.strip() for a in raw_amenities.split(",") if a.strip()]

    description = str(raw.get("description") or "")
    amenities = normalize_amenities(raw_amenities, description)

    return ListingData(
        source=str(raw.get("source") or source),
        external_id=str(raw.get("id") or raw.get("external_id") or f"{address}:{raw.get('unit', '')}"),
        address=address,
        unit=str(raw.get("unit") or raw.get("apt") or "").strip(),
        borough=str(raw.get("borough") or "").strip(),
        neighborhood=str(raw.get("neighborhood") or raw.get("area") or "").strip(),
        zip_code=str(raw.get("zip_code") or raw.get("zip") or "").strip(),
        property_type=ptype,
        price=price,
        beds=parse_currency(raw.get("beds") or raw.get("bedrooms")) or 0.0,
        baths=parse_currency(raw.get("baths") or raw.get("bathrooms")) or 0.0,
        sqft=parse_int(raw.get("sqft") or raw.get("square_feet")),
        monthly_hoa=monthly_hoa,
        monthly_maintenance=monthly_maint,
        monthly_tax=monthly_tax,
        status=str(raw.get("status") or "active").lower().strip(),
        days_on_market=parse_int(raw.get("days_on_market") or raw.get("dom")),
        url=str(raw.get("url") or raw.get("listing_url") or "").strip(),
        amenities=amenities,
        description=description,
        raw_json=raw,
    )


def load_file(path: Path) -> list[ListingData]:
    """Load normalized listings from a single .json or .csv file."""
    items: list[ListingData] = []
    suffix = path.suffix.lower()

    if suffix == ".json":
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        rows = data if isinstance(data, list) else data.get("listings", [])
        for raw in rows:
            if isinstance(raw, dict):
                parsed = parse_listing_dict(raw, source=f"local:{path.stem}")
                if parsed is not None:
                    items.append(parsed)
    elif suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                norm_row = {k.strip().lower().replace(" ", "_"): v for k, v in row.items() if k}
                parsed = parse_listing_dict(norm_row, source=f"local:{path.stem}")
                if parsed is not None:
                    items.append(parsed)
    return items


class LocalImportSource(ListingSource):
    """Ingest all .json and .csv listing exports placed in data/imports/."""

    name = "local_import"

    def __init__(self, import_dir: str | Path = "data/imports") -> None:
        self.import_dir = Path(import_dir)

    def fetch(self) -> list[ListingData]:
        if not self.import_dir.exists():
            return []
        results: list[ListingData] = []
        for path in sorted(self.import_dir.iterdir()):
            if path.is_file() and path.suffix.lower() in (".json", ".csv"):
                try:
                    results.extend(load_file(path))
                except Exception as exc:
                    logger.warning("Failed to import %s: %s", path.name, exc)
        return results
