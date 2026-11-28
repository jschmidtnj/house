"""Offline NYC subway & walking commute estimator to Midtown Manhattan."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

# Midtown Manhattan core (Grand Central / Bryant Park / 42nd St)
MIDTOWN_LAT = 40.7540
MIDTOWN_LNG = -73.9820

# Lines with direct service into Midtown Manhattan (34th-59th St / Grand Central)
_DIRECT_MIDTOWN_LINES = {
    "1", "2", "3", "4", "5", "6", "7",
    "A", "B", "C", "D", "E", "F", "M",
    "N", "Q", "R", "W", "PATH", "MNR",
}


@dataclass(frozen=True)
class CommuteEstimate:
    minutes: int
    mode: str                 # "walk" | "subway"
    nearest_station: str
    nearest_routes: tuple[str, ...]
    walk_to_station_min: int


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


@lru_cache(maxsize=1)
def load_subway_stations() -> list[dict[str, Any]]:
    """Load cached NYC transit station coordinates (MTA subway, PATH, Metro-North) from nyc_transit.json."""
    candidates = [
        Path("web/public/data/nyc_transit.json"),
        Path("web/dist/data/nyc_transit.json"),
        Path(__file__).resolve().parents[3] / "web" / "public" / "data" / "nyc_transit.json",
    ]
    for path in candidates:
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, list) and data:
                    return data
            except Exception:
                continue
    return []


def estimate_midtown_commute(
    lat: float | None,
    lng: float | None,
    target_lat: float = MIDTOWN_LAT,
    target_lng: float = MIDTOWN_LNG,
) -> CommuteEstimate | None:
    """
    Estimate door-to-door minutes from (lat, lng) to Midtown Manhattan using
    Manhattan-grid walking speed (3.0 mph) and actual MTA subway stations.
    """
    if lat is None or lng is None:
        return None

    # Grid factor (~1.25x straight-line distance for NYC street grid)
    direct_walk_miles = _haversine_miles(lat, lng, target_lat, target_lng) * 1.25
    direct_walk_min = direct_walk_miles / 3.0 * 60.0

    stations = load_subway_stations()
    if not stations:
        # Fallback if station JSON isn't present: approximate subway + walk
        est_min = min(direct_walk_min, 8.0 + (direct_walk_miles / 14.0 * 60.0))
        return CommuteEstimate(
            minutes=max(1, int(round(est_min))),
            mode="walk" if direct_walk_min <= est_min else "subway",
            nearest_station="",
            nearest_routes=(),
            walk_to_station_min=0,
        )

    # Check the 4 closest stations so an express/direct line slightly farther can beat a transfer line
    scored_stations = sorted(
        stations,
        key=lambda s: _haversine_miles(lat, lng, s["lat"], s["lng"]),
    )[:4]

    best_subway_min = float("inf")
    best_station: dict[str, Any] = scored_stations[0]
    best_walk_to_st = 0.0

    for st in scored_stations:
        walk_miles = _haversine_miles(lat, lng, st["lat"], st["lng"]) * 1.25
        walk_min = walk_miles / 3.0 * 60.0
        ride_miles = _haversine_miles(st["lat"], st["lng"], target_lat, target_lng) * 1.15

        routes = [str(r) for r in st.get("routes", [])]
        has_direct = any(r in _DIRECT_MIDTOWN_LINES for r in routes)
        wait_min = 4.0 if len(routes) >= 2 else 5.0
        transfer_min = 0.0 if has_direct else 6.0
        # NYC subway averages ~16 mph incl. stops; Metro-North commuter rail averages ~32 mph
        avg_mph = 32.0 if "MNR" in routes else 16.0
        ride_min = (ride_miles / avg_mph) * 60.0 + 3.0
        total = walk_min + wait_min + ride_min + transfer_min

        if total < best_subway_min:
            best_subway_min = total
            best_station = st
            best_walk_to_st = walk_min

    nearest_routes = tuple(str(r) for r in best_station.get("routes", []))
    if direct_walk_min <= best_subway_min:
        return CommuteEstimate(
            minutes=max(1, int(round(direct_walk_min))),
            mode="walk",
            nearest_station=str(best_station.get("name", "")),
            nearest_routes=nearest_routes,
            walk_to_station_min=max(1, int(round(best_walk_to_st))),
        )

    return CommuteEstimate(
        minutes=max(1, int(round(best_subway_min))),
        mode="subway",
        nearest_station=str(best_station.get("name", "")),
        nearest_routes=nearest_routes,
        walk_to_station_min=max(1, int(round(best_walk_to_st))),
    )
