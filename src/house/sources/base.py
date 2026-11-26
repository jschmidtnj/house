"""Base interface and normalization helpers for NYC listing sources."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Any

from house.models import ListingData


class ListingSource(ABC):
    """Abstract adapter for any NYC real estate listing provider."""

    name: str = "unknown"

    @abstractmethod
    def fetch(self) -> list[ListingData]:
        """Fetch and return normalized ListingData items."""


def parse_currency(value: Any) -> float | None:
    """Parse a currency string or number like '$1,450,000' or '1250' into float."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.]", "", str(value))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_int(value: Any) -> int | None:
    val = parse_currency(value)
    return int(round(val)) if val is not None else None


def normalize_property_type(raw: str | None) -> str:
    """Map raw site labels into canonical NYC types: condo, coop, condop, townhouse."""
    text = (raw or "").lower().strip()
    if "condop" in text:
        return "condop"
    if "co-op" in text or "coop" in text or "cooperative" in text:
        return "coop"
    if "townhouse" in text or "townhome" in text or "single family" in text or "multi" in text:
        return "townhouse"
    return "condo"


_AMENITY_KEYWORDS = {
    "laundry_in_unit": ("in-unit laundry", "in unit laundry", "washer/dryer", "washer dryer", "laundry in unit", "w/d"),
    "laundry_in_building": ("laundry in building", "laundry room", "common laundry"),
    "elevator": ("elevator",),
    "doorman": ("doorman", "concierge", "attended lobby", "24-hour"),
    "dishwasher": ("dishwasher",),
    "outdoor_space": ("balcony", "terrace", "patio", "private outdoor", "roof deck", "garden", "outdoor space"),
    "gym": ("gym", "fitness center", "fitness room"),
    "central_air": ("central air", "central a/c", "central ac", "hvac"),
    "pets_allowed": ("pets allowed", "pet friendly", "dogs allowed"),
    "storage": ("storage", "bike room"),
}


def normalize_amenities(raw_amenities: list[str] | str | None, description: str = "") -> list[str]:
    """Normalize amenity labels and extract canonical amenity tags from text."""
    found: set[str] = set()
    tokens: list[str] = []
    if isinstance(raw_amenities, list):
        for item in raw_amenities:
            s = str(item).strip().lower()
            if s:
                tokens.append(s)
                if s in _AMENITY_KEYWORDS:
                    found.add(s)
    elif isinstance(raw_amenities, str):
        tokens.append(raw_amenities.lower())

    haystack = " ".join(tokens) + " " + (description or "").lower()
    for canonical, keywords in _AMENITY_KEYWORDS.items():
        if any(kw in haystack for kw in keywords):
            found.add(canonical)
    return sorted(found)
