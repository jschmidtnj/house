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
    """Map raw site labels into canonical NYC types: condo, coop, condop, townhouse, multifamily."""
    text = (raw or "").lower().strip()
    if "condop" in text:
        return "condop"
    if "co-op" in text or "coop" in text or "cooperative" in text:
        return "coop"
    if "multi" in text or "duplex" in text or "triplex" in text:
        return "multifamily"
    if "townhouse" in text or "townhome" in text or "single_family" in text or "single family" in text:
        return "townhouse"
    return "condo"


_WORD_TO_INT = {"two": 2, "three": 3, "four": 4, "2": 2, "3": 3, "4": 4}
_UNIT_PATTERNS = [
    re.compile(r"\b(two|three|four|2|3|4)[\s-]+(?:family|unit)\b", re.IGNORECASE),
    re.compile(r"\b(2|3|4)\s*(?:units|families)\b", re.IGNORECASE),
]


def detect_num_units(
    property_type: str,
    description: str = "",
    raw_units: Any = None,
) -> int:
    """Infer number of residential units (1-4) for NYC townhouses / multi-family buildings."""
    if raw_units is not None:
        val = parse_int(raw_units)
        if val is not None and 1 <= val <= 12:
            return val
    ptype = (property_type or "").lower()
    if ptype in ("condo", "coop", "condop"):
        return 1
    text = description or ""
    for pat in _UNIT_PATTERNS:
        m = pat.search(text)
        if m:
            num = _WORD_TO_INT.get(m.group(1).lower())
            if num:
                return num
    if ptype == "multifamily":
        return 2
    return 1


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
