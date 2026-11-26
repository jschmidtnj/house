"""Filtering and weighted composite scoring engine for NYC apartment listings."""

from __future__ import annotations

import json

from house.config import BudgetConfig, SearchConfig
from house.db import Database, Listing
from house.finance import calculate_cost_breakdown
from house.models import ListingData, ScoredListing


def _clamp01(val: float) -> float:
    return max(0.0, min(1.0, val))


def score_listing(
    listing_id: int,
    canonical_key: str,
    listing: ListingData,
    budget: BudgetConfig,
    search: SearchConfig,
    *,
    initial_price: float | None = None,
    sources: list[str] | None = None,
) -> ScoredListing:
    """Evaluate a single listing against budget knobs & search criteria and compute a 0-100 score."""
    costs = calculate_cost_breakdown(listing, budget)
    rejections: list[str] = []

    # 1. Hard budget filters
    if listing.price > budget.max_price:
        rejections.append(f"Price ${listing.price:,.0f} > max ${budget.max_price:,.0f}")
    if listing.price < budget.min_price:
        rejections.append(f"Price ${listing.price:,.0f} < min ${budget.min_price:,.0f}")

    effective_monthly = (
        costs.effective_after_tax_monthly
        if budget.use_after_tax_for_filter
        else costs.total_monthly_cost
    )
    if effective_monthly > budget.max_monthly_cost:
        rejections.append(
            f"Monthly ${effective_monthly:,.0f}/mo > max ${budget.max_monthly_cost:,.0f}/mo"
        )

    # 2. Property type & location filters
    ptype = (listing.property_type or "condo").lower()
    allowed_types = [t.lower() for t in search.property_types]
    if allowed_types and ptype not in allowed_types:
        rejections.append(f"Type '{ptype}' not in {allowed_types}")

    allowed_boroughs = [b.lower() for b in search.boroughs]
    if allowed_boroughs and listing.borough and listing.borough.lower() not in allowed_boroughs:
        rejections.append(f"Borough '{listing.borough}' not in {search.boroughs}")

    allowed_hoods = [n.lower() for n in search.neighborhoods]
    if allowed_hoods and listing.neighborhood and listing.neighborhood.lower() not in allowed_hoods:
        rejections.append(f"Neighborhood '{listing.neighborhood}' not in target list")

    # 3. Size & layout filters
    if listing.beds < search.min_beds:
        rejections.append(f"Beds {listing.beds:g} < min {search.min_beds:g}")
    if listing.baths < search.min_baths:
        rejections.append(f"Baths {listing.baths:g} < min {search.min_baths:g}")
    if search.min_sqft > 0 and listing.sqft is not None and listing.sqft < search.min_sqft:
        rejections.append(f"Sqft {listing.sqft} < min {search.min_sqft}")

    # 4. Required amenities
    listing_amenities = {a.lower() for a in listing.amenities}
    for req in search.required_amenities:
        if req.lower() not in listing_amenities:
            rejections.append(f"Missing required amenity: {req}")

    # ---- Composite Score (0 - 100) ----

    # Monthly headroom: 1.0 when <= 65% of max_monthly_cost, 0.0 at >= 100%
    if budget.max_monthly_cost > 0:
        ratio = effective_monthly / budget.max_monthly_cost
        headroom_score = _clamp01((1.05 - ratio) / 0.40)
    else:
        headroom_score = 0.5

    # Price per sqft value relative to target_price_per_sqft
    if listing.sqft and listing.sqft > 0 and search.target_price_per_sqft > 0:
        ppsf = listing.price / listing.sqft
        # 1.0 if <= 75% of target, 0.5 at target, 0.0 if >= 145% of target
        ppsf_score = _clamp01((1.45 - (ppsf / search.target_price_per_sqft)) / 0.70)
    else:
        ppsf_score = 0.5

    # Size fit (beds/baths/sqft comfort above minimums)
    bed_bonus = _clamp01((listing.beds - search.min_beds) / 1.5) * 0.45 + 0.35
    bath_bonus = _clamp01((listing.baths - search.min_baths) / 1.0) * 0.25 + 0.15
    sqft_bonus = 0.20 if (listing.sqft and listing.sqft >= max(900, search.min_sqft + 200)) else 0.10
    size_score = _clamp01(bed_bonus + bath_bonus + sqft_bonus - 0.10)

    # Amenities match
    pref = [a.lower() for a in search.preferred_amenities]
    if pref:
        matched = sum(1 for a in pref if a in listing_amenities)
        amenities_score = _clamp01(matched / len(pref))
    else:
        amenities_score = 0.5

    # Price drop bonus (relative to initial_price)
    price_drop_pct = 0.0
    if initial_price and initial_price > listing.price and initial_price > 0:
        price_drop_pct = ((initial_price - listing.price) / initial_price) * 100.0
    price_drop_score = _clamp01(price_drop_pct / 10.0)

    # Carrying-fees ratio penalty (keeps high-maintenance co-ops honest)
    fees_penalty = 0.0
    if costs.monthly_fees_ratio > budget.max_monthly_fees_ratio:
        excess = costs.monthly_fees_ratio - budget.max_monthly_fees_ratio
        fees_penalty = min(15.0, excess * 100.0 * 0.75)

    components = {
        "monthly_headroom": round(headroom_score * 100.0, 1),
        "price_per_sqft": round(ppsf_score * 100.0, 1),
        "size_fit": round(size_score * 100.0, 1),
        "amenities": round(amenities_score * 100.0, 1),
        "price_drop": round(price_drop_score * 100.0, 1),
    }

    w = search.weights
    total_w = sum(max(0.0, float(w.get(k, 0.0))) for k in components) or 1.0
    raw_score = sum(
        (max(0.0, float(w.get(k, 0.0))) / total_w) * components[k] for k in components
    )
    final_score = max(0.0, min(100.0, raw_score - fees_penalty))

    return ScoredListing(
        listing_id=listing_id,
        canonical_key=canonical_key,
        listing=listing,
        costs=costs,
        score=round(final_score, 1),
        passes_filters=len(rejections) == 0,
        rejection_reasons=rejections,
        score_components=components,
        price_drop_pct=round(price_drop_pct, 2),
        initial_price=initial_price,
        sources=sources or [listing.source],
    )


def rank_listings(
    rows: list[Listing],
    budget: BudgetConfig,
    search: SearchConfig,
    *,
    include_rejected: bool = False,
) -> list[ScoredListing]:
    """Score and sort database Listing rows (matching listings first, highest score first)."""
    scored: list[ScoredListing] = []
    for row in rows:
        item = Database.to_listing_data(row)
        sources = json.loads(row.sources_json or "[]")
        res = score_listing(
            listing_id=row.id,
            canonical_key=row.canonical_key,
            listing=item,
            budget=budget,
            search=search,
            initial_price=row.initial_price,
            sources=sources,
        )
        if res.passes_filters or include_rejected:
            scored.append(res)

    scored.sort(key=lambda s: (s.passes_filters, s.score, -s.costs.total_monthly_cost), reverse=True)
    return scored
