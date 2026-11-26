"""HomeHarvest adapter for free, unlimited NYC for-sale listings (Realtor.com / MLS)."""

from __future__ import annotations

import logging
import math
from typing import Any

from house.config import BudgetConfig, HomeHarvestSourceConfig, SearchConfig
from house.models import ListingData
from house.sources.base import (
    ListingSource,
    detect_num_units,
    normalize_amenities,
    normalize_property_type,
    parse_currency,
    parse_int,
)

logger = logging.getLogger(__name__)


def _clean_val(val: Any) -> Any:
    """Convert pandas NaN / None into None."""
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if str(val).strip().lower() in ("nan", "none", "nat", ""):
        return None
    return val


def _infer_borough(county: str, city: str, zip_code: str) -> str:
    c = (county or "").lower()
    ci = (city or "").lower()
    if "new york" in c or "manhattan" in ci or zip_code.startswith(("100", "101", "102")):
        return "Manhattan"
    if "kings" in c or "brooklyn" in ci or zip_code.startswith("112"):
        return "Brooklyn"
    if "queens" in c or "queens" in ci or zip_code.startswith(("111", "113", "114", "116")):
        return "Queens"
    if "bronx" in c or "bronx" in ci or zip_code.startswith("104"):
        return "Bronx"
    if "richmond" in c or "staten island" in ci or zip_code.startswith("103"):
        return "Staten Island"
    return city.title() if city else ""


def _extract_monthly_tax(row: dict[str, Any]) -> float | None:
    """Extract monthly property tax from HomeHarvest `tax` or `tax_history` fields."""
    raw_tax = _clean_val(row.get("tax"))
    if raw_tax is not None:
        val = parse_currency(raw_tax)
        if val is not None and val > 0:
            # HomeHarvest `tax` is typically annual; values > 3000 are clearly annual
            return round(val / 12.0, 2) if val > 3000 else round(val, 2)

    history = _clean_val(row.get("tax_history"))
    if isinstance(history, list) and history:
        # Sort by year descending if dicts have a year field
        valid = [h for h in history if isinstance(h, dict) and _clean_val(h.get("tax"))]
        if valid:
            valid.sort(key=lambda h: int(h.get("year") or 0), reverse=True)
            annual = parse_currency(valid[0].get("tax"))
            if annual is not None and annual > 0:
                return round(annual / 12.0, 2)
    return None


def parse_homeharvest_row(row: dict[str, Any]) -> ListingData | None:
    """Convert a single HomeHarvest record dict into a normalized ListingData."""
    price = parse_currency(_clean_val(row.get("list_price")) or _clean_val(row.get("price")))
    street = str(_clean_val(row.get("street")) or _clean_val(row.get("formatted_address")) or "").strip()
    if not street or not price or price <= 0:
        return None

    unit = str(_clean_val(row.get("unit")) or "").strip()
    city = str(_clean_val(row.get("city")) or "").strip()
    county = str(_clean_val(row.get("county")) or "").strip()
    zip_code = str(_clean_val(row.get("zip_code")) or "").strip()
    if zip_code.endswith(".0"):
        zip_code = zip_code[:-2]

    borough = _infer_borough(county, city, zip_code)

    raw_hoods = _clean_val(row.get("neighborhoods"))
    neighborhood = ""
    if isinstance(raw_hoods, list) and raw_hoods:
        neighborhood = str(raw_hoods[0]).strip()
    elif isinstance(raw_hoods, str):
        neighborhood = raw_hoods.split(",")[0].strip()

    description = str(_clean_val(row.get("text")) or _clean_val(row.get("description")) or "")
    style = str(_clean_val(row.get("style")) or "")
    ptype = normalize_property_type(style)
    # Realtor.com often tags NYC co-ops under style="CONDOS" with "co-op"/"cooperative" in text
    desc_lower = description.lower()
    if ptype == "condo" and any(k in desc_lower for k in ("co-op", "coop", "cooperative", "board approval", "maintenance")):
        if "condo" not in desc_lower or "co-op" in desc_lower or "cooperative" in desc_lower:
            ptype = "coop"

    num_units = detect_num_units(ptype, description, _clean_val(row.get("units")))
    if num_units >= 2 and ptype in ("townhouse", "condo"):
        ptype = "multifamily"

    hoa_fee = parse_currency(_clean_val(row.get("hoa_fee")))
    monthly_hoa: float | None = None
    monthly_maint: float | None = None
    monthly_tax: float | None = None

    if ptype == "coop":
        monthly_maint = hoa_fee
    else:
        monthly_hoa = hoa_fee
        monthly_tax = _extract_monthly_tax(row)

    full_baths = parse_currency(_clean_val(row.get("full_baths"))) or 0.0
    half_baths = parse_currency(_clean_val(row.get("half_baths"))) or 0.0
    baths = full_baths + (0.5 * half_baths)
    if baths <= 0:
        baths = parse_currency(_clean_val(row.get("baths"))) or 0.0

    beds = parse_currency(_clean_val(row.get("beds"))) or 0.0
    sqft = parse_int(_clean_val(row.get("sqft")))
    dom = parse_int(_clean_val(row.get("days_on_mls")))
    url = str(_clean_val(row.get("property_url")) or "").strip()
    ext_id = str(_clean_val(row.get("property_id")) or _clean_val(row.get("mls_id")) or url or f"{street}:{unit}")

    status_raw = str(_clean_val(row.get("status")) or "active").lower()
    status = "active" if status_raw in ("for_sale", "active", "") else status_raw

    return ListingData(
        source="homeharvest",
        external_id=ext_id,
        address=street,
        unit=unit,
        borough=borough,
        neighborhood=neighborhood,
        zip_code=zip_code,
        property_type=ptype,
        num_units=num_units,
        price=price,
        beds=beds,
        baths=baths,
        sqft=sqft,
        monthly_hoa=monthly_hoa,
        monthly_maintenance=monthly_maint,
        monthly_tax=monthly_tax,
        status=status,
        days_on_market=dom,
        url=url,
        latitude=parse_currency(_clean_val(row.get("latitude"))),
        longitude=parse_currency(_clean_val(row.get("longitude"))),
        photo_url=str(_clean_val(row.get("primary_photo")) or ""),
        amenities=normalize_amenities([], description),
        description=description[:500],
        raw_json={k: v for k, v in row.items() if _clean_val(v) is not None},
    )


class HomeHarvestSource(ListingSource):
    """Fetch active NYC for-sale listings using the free `homeharvest` library."""

    name = "homeharvest"

    def __init__(
        self,
        source_cfg: HomeHarvestSourceConfig,
        budget: BudgetConfig,
        search: SearchConfig,
    ) -> None:
        self.source_cfg = source_cfg
        self.budget = budget
        self.search = search

    def fetch(self) -> list[ListingData]:
        try:
            from homeharvest import scrape_property
        except ImportError:
            logger.warning(
                "Skipping %s: `homeharvest` is not installed. Install with: pip install -e '.[live]'",
                self.name,
            )
            return []

        results: list[ListingData] = []
        passes: list[list[str] | None] = [None]
        if self.source_cfg.include_multifamily_pass:
            passes.append(["multi_family", "townhomes"])

        for location in self.source_cfg.locations:
            for ptypes in passes:
                try:
                    kwargs: dict[str, Any] = {
                        "location": location,
                        "listing_type": "for_sale",
                        "past_days": self.source_cfg.past_days if ptypes is None else max(30, self.source_cfg.past_days),
                        "limit": self.source_cfg.limit if ptypes is None else min(100, self.source_cfg.limit),
                        "extra_property_data": self.source_cfg.extra_property_data,
                        "price_max": int(self.budget.max_price),
                    }
                    if ptypes is not None:
                        kwargs["property_type"] = ptypes
                    if self.budget.min_price > 0:
                        kwargs["price_min"] = int(self.budget.min_price)
                    if self.search.min_beds > 0 and ptypes is None:
                        kwargs["beds_min"] = int(self.search.min_beds)

                    df = scrape_property(**kwargs)
                except Exception as exc:
                    logger.error("HomeHarvest fetch failed for '%s' (types=%s): %s", location, ptypes, exc)
                    continue

                if df is None or len(df) == 0:
                    continue

                records = df.to_dict(orient="records") if hasattr(df, "to_dict") else list(df)
                for rec in records:
                    if isinstance(rec, dict):
                        parsed = parse_homeharvest_row(rec)
                        if parsed is not None:
                            results.append(parsed)
        return results
