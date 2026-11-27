"""Smart alert engine: named profiles, watchlist triggers, favorite-building alerts, and Taste Match."""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from house.config import AlertProfileConfig, AppConfig
from house.db import Database
from house.models import ScoredListing

_STREET_ABBREV = {
    "street": "st",
    "avenue": "ave",
    "boulevard": "blvd",
    "place": "pl",
    "road": "rd",
    "drive": "dr",
    "parkway": "pkwy",
    "square": "sq",
    "west": "w",
    "east": "e",
    "north": "n",
    "south": "s",
}

_NEGATIVE_DESC_SIGNALS = (
    "exposed brick",
    "exposed-brick",
)


def normalize_building_key(address: str, zip_code: str = "") -> str:
    """
    Normalize a street address to a building-level key so unit variations and Queens/LIC
    hyphen differences (`46-30 21st St` vs `4630 21st St`) collapse to the same building.
    """
    addr = (address or "").lower().strip()
    addr = re.split(r",|\bnew york\b|\bbrooklyn\b|\bmanhattan\b|\bqueens\b|\bny\b", addr)[0]
    # Strip trailing unit/apt markers embedded in address
    addr = re.split(r"\s+(?:apt|unit|ste|suite|#)\b", addr)[0]
    # Merge hyphenated Queens/LIC house numbers like "46-30" -> "4630"
    addr = re.sub(r"\b(\d+)-(\d+)\b", r"\1\2", addr)
    tokens = re.findall(r"[a-z0-9]+", addr)
    norm_tokens = [_STREET_ABBREV.get(t, t) for t in tokens]
    norm_addr = " ".join(norm_tokens)
    norm_zip = re.sub(r"[^0-9]", "", zip_code or "")[:5]
    if not norm_addr:
        return ""
    return f"{norm_addr}|{norm_zip}" if norm_zip else norm_addr


def _effective_monthly(item: ScoredListing, cfg: AppConfig) -> float:
    c = item.costs
    if cfg.budget.use_net_rental_for_filter and c.rentable_units > 0:
        base = c.net_monthly_cost
    else:
        base = c.total_monthly_cost
    if cfg.budget.use_after_tax_for_filter:
        rental = c.estimated_net_rental_income if cfg.budget.use_net_rental_for_filter else 0.0
        return max(0.0, c.effective_after_tax_monthly - rental)
    return base


def _sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-min(x, 40.0))
        return 1.0 / (1.0 + z)
    z = math.exp(max(x, -40.0))
    return z / (1.0 + z)


def _median(vals: list[float], default: float) -> float:
    if not vals:
        return default
    s = sorted(vals)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 == 1 else (s[mid - 1] + s[mid]) / 2.0


class TasteModel:
    """
    Transparent, zero-dependency preference scorer learned live from saved (positive)
    vs. hidden (negative) listings in SQLite.
    """

    def __init__(
        self,
        positives: list[ScoredListing],
        negatives: list[ScoredListing],
        *,
        min_examples: int = 5,
    ) -> None:
        self.n_pos = len(positives)
        self.n_neg = len(negatives)
        self.active = self.n_pos >= min_examples

        self.pos_fees_med = _median([s.costs.monthly_fees_ratio for s in positives], 0.19)
        self.neg_fees_med = _median([s.costs.monthly_fees_ratio for s in negatives], 0.28)
        self.pos_hoa_med = _median([s.costs.monthly_hoa_or_maint for s in positives], 500.0)
        self.neg_hoa_med = _median([s.costs.monthly_hoa_or_maint for s in negatives], 1000.0)
        self.pos_year_med = _median(
            [float(s.listing.year_built) for s in positives if s.listing.year_built], 1995.0
        )
        self.neg_year_med = _median(
            [float(s.listing.year_built) for s in negatives if s.listing.year_built], 1950.0
        )

        # Smoothed empirical categorical counts
        self.pos_types = Counter(s.listing.property_type.lower() for s in positives)
        self.neg_types = Counter(s.listing.property_type.lower() for s in negatives)
        self.pos_boroughs = Counter(s.listing.borough.lower() for s in positives if s.listing.borough)
        self.neg_boroughs = Counter(s.listing.borough.lower() for s in negatives if s.listing.borough)
        self.pos_zips = Counter((s.listing.zip_code or "")[:5] for s in positives if s.listing.zip_code)
        self.neg_zips = Counter((s.listing.zip_code or "")[:5] for s in negatives if s.listing.zip_code)
        self.pos_amens = Counter(a.lower() for s in positives for a in s.listing.amenities)
        self.neg_amens = Counter(a.lower() for s in negatives for a in s.listing.amenities)
        self.pos_2br_rate = (
            sum(1 for s in positives if s.listing.beds >= 2.0) / self.n_pos if self.n_pos else 0.7
        )
        self.pos_2ba_rate = (
            sum(1 for s in positives if s.listing.baths >= 2.0) / self.n_pos if self.n_pos else 0.5
        )

    def _log_odds(
        self,
        pos_count: int,
        neg_count: int,
        alpha: float = 2.0,
        clamp: float = 1.2,
    ) -> float:
        p_pos = (pos_count + alpha) / (self.n_pos + 2.0 * alpha)
        p_neg = (neg_count + alpha) / (self.n_neg + 2.0 * alpha) if self.n_neg > 0 else 0.5
        val = math.log(p_pos / max(p_neg, 1e-6))
        return max(-clamp, min(clamp, val))

    def score(self, item: ScoredListing) -> tuple[float, list[str]]:
        """Return `(taste_score_0_100, human_reasons)`."""
        if not self.active:
            return 50.0, []

        l = item.listing
        c = item.costs
        logit = 0.0
        reasons: list[tuple[float, str]] = []

        # 1. Monthly fees ratio (strongest separator: fav med ~0.19 vs hidden ~0.26+)
        fees_mid = (self.pos_fees_med + self.neg_fees_med) / 2.0
        fees_diff = (fees_mid - c.monthly_fees_ratio) * 6.5
        fees_term = max(-1.8, min(1.4, fees_diff))
        logit += fees_term
        if c.monthly_fees_ratio <= 0.22:
            reasons.append((fees_term, f"low fees {c.monthly_fees_ratio * 100:.0f}%"))
        elif c.monthly_fees_ratio >= 0.34:
            reasons.append((fees_term, f"high fees {c.monthly_fees_ratio * 100:.0f}%"))

        # 2. Monthly HOA / Maintenance dollar amount (fav med ~$486 vs hidden ~$949)
        hoa_mid = (self.pos_hoa_med + self.neg_hoa_med) / 2.0
        hoa_term = max(-1.2, min(0.9, (hoa_mid - c.monthly_hoa_or_maint) / 600.0))
        logit += hoa_term
        if c.monthly_hoa_or_maint <= 750 and l.property_type != "multifamily":
            reasons.append((hoa_term, f"low HOA ${c.monthly_hoa_or_maint:,.0f}/mo"))

        # 3. Year built (modern builds strongly favored)
        if l.year_built is not None:
            yr_mid = (self.pos_year_med + self.neg_year_med) / 2.0
            yr_term = max(-0.9, min(1.1, (l.year_built - yr_mid) / 40.0))
            logit += yr_term
            if l.year_built >= 2010:
                reasons.append((yr_term, f"{l.year_built} build"))

        # 4. Beds & baths fit
        if self.pos_2br_rate >= 0.65:
            if l.beds >= 2.0:
                logit += 0.55
                reasons.append((0.55, f"{l.beds:g}bd/{l.baths:g}ba"))
            else:
                logit -= 0.65
        if self.pos_2ba_rate >= 0.45 and l.baths >= 2.0:
            logit += 0.30

        # 5. Property type affinity
        ptype = (l.property_type or "condo").lower()
        pt_term = self._log_odds(self.pos_types[ptype], self.neg_types[ptype], alpha=2.0, clamp=0.8)
        logit += pt_term

        # 6. Borough & zip affinity (Laplace-smoothed so new zips aren't zeroed out)
        borough = (l.borough or "").lower()
        if borough:
            b_term = self._log_odds(
                self.pos_boroughs[borough], self.neg_boroughs[borough], alpha=2.5, clamp=1.0
            )
            logit += b_term
            if b_term >= 0.35:
                reasons.append((b_term, l.borough))

        z = (l.zip_code or "")[:5]
        if z:
            z_term = self._log_odds(self.pos_zips[z], self.neg_zips[z], alpha=1.5, clamp=1.0)
            logit += z_term
            if z_term >= 0.40:
                reasons.append((z_term, f"zip {z}"))

        # 7. Amenity lift (dishwasher, outdoor_space, storage, doorman, laundry_in_unit, gym)
        amen_sum = 0.0
        matched_pos_amens: list[str] = []
        for a in {x.lower() for x in l.amenities}:
            if a in ("dishwasher", "outdoor_space", "storage", "doorman", "laundry_in_unit", "gym"):
                lift = self._log_odds(self.pos_amens[a], self.neg_amens[a], alpha=3.0, clamp=0.35)
                if lift > 0.05:
                    amen_sum += lift
                    matched_pos_amens.append(a.replace("_", " "))
        amen_term = max(-0.4, min(0.75, amen_sum))
        logit += amen_term
        if matched_pos_amens:
            reasons.append((amen_term, ", ".join(sorted(matched_pos_amens)[:2])))

        # 8. Negative description signals (exposed brick, pied-a-terre, estate, basement, etc.)
        desc = (l.description or "").lower()
        neg_hits = [kw for kw in _NEGATIVE_DESC_SIGNALS if kw in desc]
        if neg_hits:
            logit -= min(1.5, 0.75 * len(neg_hits))

        prob = _sigmoid(logit)
        score_100 = round(prob * 100.0, 1)
        pos_reasons = [txt for weight, txt in sorted(reasons, key=lambda x: -x[0]) if weight > 0][:4]
        return score_100, pos_reasons


@dataclass
class AlertCandidate:
    listing_id: int
    canonical_key: str
    alert_type: str  # WATCHLIST_PRICE_DROP | WATCHLIST_BUDGET | WATCHLIST_STATUS | FAVORITE_BUILDING | PROFILE_MATCH
    dedupe_key: str
    priority: int  # 1 = watchlist, 2 = fav building, 3 = profile match
    scored: ScoredListing
    matched_profiles: list[str] = field(default_factory=list)
    taste_score: float | None = None
    taste_reasons: list[str] = field(default_factory=list)
    summary_reason: str = ""
    watch_list_name: str = ""


def _load_user_lists(db: Database) -> tuple[set[int], set[int], dict[str, set[int]]]:
    saved_raw = db.get_bot_state("saved_listing_ids")
    hidden_raw = db.get_bot_state("hidden_listing_ids")
    lists_raw = db.get_bot_state("custom_lists")

    saved = {int(x) for x in json.loads(saved_raw or "[]") if str(x).isdigit()}
    hidden = {int(x) for x in json.loads(hidden_raw or "[]") if str(x).isdigit()}

    custom: dict[str, set[int]] = {}
    parsed = json.loads(lists_raw or "{}")
    if isinstance(parsed, dict):
        for k, v in parsed.items():
            if isinstance(v, list):
                custom[str(k)] = {int(x) for x in v if str(x).isdigit()}
    return saved, hidden, custom


def _has_excluded_keyword(description: str, keywords: list[str]) -> bool:
    if not keywords or not description:
        return False
    desc = description.lower()
    return any(kw.lower() in desc for kw in keywords if kw.strip())


def _matches_profile(
    item: ScoredListing,
    profile: AlertProfileConfig,
    cfg: AppConfig,
    taste_score: float | None,
) -> bool:
    if not profile.enabled:
        return False
    l = item.listing
    c = item.costs

    # Respect global HDFC / land-lease exclusions from search config
    desc_lower = (l.description or "").lower()
    if cfg.search.exclude_hdfc and any(
        kw in desc_lower
        for kw in ("hdfc", "income restricted", "income-restricted", "income cap", "mitchell-lama", "ami limit")
    ):
        return False
    if cfg.search.exclude_land_lease and any(
        kw in desc_lower for kw in ("land lease", "land-lease", "ground lease")
    ):
        return False

    # Global + profile guardrails
    min_price = profile.min_price if profile.min_price is not None else cfg.alerts.min_price
    if l.price < min_price:
        return False
    if profile.max_price is not None and l.price > profile.max_price:
        return False

    max_fees = profile.max_fees_ratio if profile.max_fees_ratio is not None else cfg.alerts.max_fees_ratio
    if max_fees is not None and c.monthly_fees_ratio > max_fees:
        return False

    if profile.max_monthly_hoa_maint is not None and c.monthly_hoa_or_maint > profile.max_monthly_hoa_maint:
        return False

    kws = profile.exclude_keywords if profile.exclude_keywords is not None else cfg.alerts.exclude_keywords
    if _has_excluded_keyword(l.description, kws):
        return False

    # Monthly cost cap (uses net monthly for multi-unit when enabled in budget config)
    eff_monthly = _effective_monthly(item, cfg)
    max_mo = profile.max_monthly_cost if profile.max_monthly_cost is not None else cfg.budget.max_monthly_cost
    if eff_monthly > max_mo:
        return False

    # Property type & units
    ptype = (l.property_type or "condo").lower()
    if profile.property_types and ptype not in {t.lower() for t in profile.property_types}:
        return False
    if l.num_units < profile.min_units:
        return False
    if profile.max_units is not None and l.num_units > profile.max_units:
        return False

    # Geography
    if profile.boroughs and (l.borough or "").lower() not in {b.lower() for b in profile.boroughs}:
        return False
    if profile.zip_codes or profile.neighborhoods:
        z = (l.zip_code or "").strip()[:5]
        hood = (l.neighborhood or "").strip().lower()
        z_ok = bool(z and z in {str(x).strip()[:5] for x in profile.zip_codes})
        h_ok = bool(hood and hood in {x.strip().lower() for x in profile.neighborhoods})
        if not (z_ok or h_ok):
            return False

    # Size & building age
    if l.beds < profile.min_beds:
        return False
    if l.baths < profile.min_baths:
        return False
    if profile.min_sqft > 0 and (l.sqft is None or l.sqft < profile.min_sqft):
        return False
    if profile.min_year_built is not None:
        if l.year_built is None or l.year_built < profile.min_year_built:
            return False
    if profile.max_year_built is not None:
        if l.year_built is None or l.year_built > profile.max_year_built:
            return False

    # Commute
    if (
        profile.max_commute_minutes is not None
        and item.commute_minutes is not None
        and item.commute_minutes > profile.max_commute_minutes
    ):
        return False
    if (
        profile.max_walk_to_station_min is not None
        and item.walk_to_station_min is not None
        and item.walk_to_station_min > profile.max_walk_to_station_min
    ):
        return False

    # Taste match gate
    if cfg.alerts.taste_match.enabled and taste_score is not None:
        min_taste = (
            profile.min_taste_score
            if profile.min_taste_score is not None
            else cfg.alerts.taste_match.min_taste_score
        )
        if taste_score < min_taste:
            return False

    return True


def evaluate_alerts(
    cfg: AppConfig,
    db: Database,
    scored_all: list[ScoredListing],
    *,
    update_watchlist_state: bool = True,
) -> list[AlertCandidate]:
    """
    Evaluate all listings against:
    1. Watchlist alerts (price drops, dropping into budget, status changes on Favorites/lists)
    2. Favorite-building alerts (new units in buildings you already favorited)
    3. Named alert profiles gated by Taste Match (learned from Favorites vs. Hidden)
    """
    alerts_cfg = cfg.alerts
    saved_ids, hidden_ids, custom_lists = _load_user_lists(db)

    by_id = {s.listing_id: s for s in scored_all}

    # Build TasteModel from Favorites (positive) vs Hidden (negative)
    positives = [by_id[i] for i in saved_ids if i in by_id]
    negatives = [by_id[i] for i in hidden_ids if i in by_id]
    taste_model = TasteModel(
        positives,
        negatives,
        min_examples=alerts_cfg.taste_match.min_examples,
    )

    # Assemble watchlist map: listing_id -> source label
    watched: dict[int, str] = {}
    if alerts_cfg.watchlist.enabled:
        if alerts_cfg.watchlist.include_saved:
            for lid in saved_ids:
                watched[lid] = "Favorites"
        for lname in alerts_cfg.watchlist.include_lists:
            for lid in custom_lists.get(lname, set()):
                watched.setdefault(lid, f"List: {lname}")

    # Collect favorite building keys
    fav_buildings: dict[str, str] = {}
    if alerts_cfg.favorite_buildings.enabled:
        for lid in saved_ids:
            s = by_id.get(lid)
            if s is None:
                continue
            bkey = normalize_building_key(s.listing.address, s.listing.zip_code)
            if bkey:
                fav_buildings.setdefault(bkey, s.listing.address)

    # Track prior watched statuses for status-change alerts
    prev_statuses_raw = db.get_bot_state("watchlist_statuses")
    prev_statuses: dict[str, str] = json.loads(prev_statuses_raw or "{}")
    new_statuses = dict(prev_statuses)

    candidates: list[AlertCandidate] = []
    seen_listing_ids: set[int] = set()

    # ---- 1. Watchlist Alerts (Priority 1) ----
    if alerts_cfg.watchlist.enabled:
        for lid, watch_label in watched.items():
            item = by_id.get(lid)
            if item is None:
                continue
            if alerts_cfg.respect_hidden and lid in hidden_ids:
                continue

            t_score, t_reasons = taste_model.score(item) if taste_model.active else (None, [])
            cur_status = (item.listing.status or "active").lower()
            prev_status = prev_statuses.get(str(lid))
            new_statuses[str(lid)] = cur_status

            # 1a. Price drop on a watched listing
            if item.price_drop_pct >= alerts_cfg.watchlist.price_drop_pct and cur_status == "active":
                price_bucket = int(round(item.listing.price / 1000.0))
                candidates.append(
                    AlertCandidate(
                        listing_id=lid,
                        canonical_key=item.canonical_key,
                        alert_type="WATCHLIST_PRICE_DROP",
                        dedupe_key=f"WATCHLIST_PRICE_DROP:{item.canonical_key}:{price_bucket}",
                        priority=1,
                        scored=item,
                        taste_score=t_score,
                        taste_reasons=t_reasons,
                        summary_reason=(
                            f"Dropped {item.price_drop_pct:.1f}% from ${item.initial_price or item.listing.price:,.0f} "
                            f"to ${item.listing.price:,.0f}"
                        ),
                        watch_list_name=watch_label,
                    )
                )
                seen_listing_ids.add(lid)

            # 1b. Watched listing dropped into monthly budget target
            eff_mo = _effective_monthly(item, cfg)
            if (
                alerts_cfg.watchlist.budget_threshold_alert
                and cur_status == "active"
                and item.price_drop_pct > 0
                and eff_mo <= cfg.budget.max_monthly_cost
            ):
                candidates.append(
                    AlertCandidate(
                        listing_id=lid,
                        canonical_key=item.canonical_key,
                        alert_type="WATCHLIST_BUDGET",
                        dedupe_key=f"WATCHLIST_BUDGET:{item.canonical_key}:{int(cfg.budget.max_monthly_cost)}",
                        priority=1,
                        scored=item,
                        taste_score=t_score,
                        taste_reasons=t_reasons,
                        summary_reason=f"Now ${eff_mo:,.0f}/mo — within your ${cfg.budget.max_monthly_cost:,.0f}/mo target",
                        watch_list_name=watch_label,
                    )
                )
                seen_listing_ids.add(lid)

            # 1c. Status change on a watched listing (only after baseline status was recorded)
            if (
                alerts_cfg.watchlist.status_change_alert
                and prev_status is not None
                and prev_status != cur_status
            ):
                candidates.append(
                    AlertCandidate(
                        listing_id=lid,
                        canonical_key=item.canonical_key,
                        alert_type="WATCHLIST_STATUS",
                        dedupe_key=f"WATCHLIST_STATUS:{item.canonical_key}:{prev_status}->{cur_status}",
                        priority=1,
                        scored=item,
                        taste_score=t_score,
                        taste_reasons=t_reasons,
                        summary_reason=f"Status changed: {prev_status} → {cur_status}",
                        watch_list_name=watch_label,
                    )
                )
                seen_listing_ids.add(lid)

    if update_watchlist_state and watched:
        db.set_bot_state("watchlist_statuses", json.dumps(new_statuses))

    # ---- 2. Favorite-Building & Profile Alerts (Active, non-hidden, non-already-saved) ----
    for item in scored_all:
        lid = item.listing_id
        if (item.listing.status or "active").lower() != "active":
            continue
        if alerts_cfg.respect_hidden and lid in hidden_ids:
            continue
        if lid in saved_ids or lid in seen_listing_ids:
            continue

        t_score, t_reasons = taste_model.score(item) if taste_model.active else (None, [])
        eff_mo = _effective_monthly(item, cfg)

        # 2a. New unit in a favorited building
        bkey = normalize_building_key(item.listing.address, item.listing.zip_code)
        if (
            alerts_cfg.favorite_buildings.enabled
            and bkey
            and bkey in fav_buildings
            and eff_mo <= alerts_cfg.favorite_buildings.max_monthly_cost
            and item.listing.price >= alerts_cfg.min_price
            and item.costs.monthly_fees_ratio <= alerts_cfg.max_fees_ratio
        ):
            matched_profs = [
                p.name for p in alerts_cfg.profiles if _matches_profile(item, p, cfg, t_score)
            ]
            candidates.append(
                AlertCandidate(
                    listing_id=lid,
                    canonical_key=item.canonical_key,
                    alert_type="FAVORITE_BUILDING",
                    dedupe_key=f"FAVORITE_BUILDING:{item.canonical_key}",
                    priority=2,
                    scored=item,
                    matched_profiles=matched_profs,
                    taste_score=t_score,
                    taste_reasons=t_reasons,
                    summary_reason=f"New unit in favorited building ({fav_buildings[bkey]})",
                )
            )
            continue

        # 2b. Named Alert Profiles
        matched_profs = [
            p.name for p in alerts_cfg.profiles if _matches_profile(item, p, cfg, t_score)
        ]
        if matched_profs:
            is_drop = item.price_drop_pct >= cfg.search.price_drop_notify_pct
            if is_drop:
                price_bucket = int(round(item.listing.price / 1000.0))
                alert_type = "PRICE_DROP"
                dedupe_key = f"PRICE_DROP:{item.canonical_key}:{price_bucket}"
                summary = f"Price drop (-{item.price_drop_pct:.1f}%) matching {', '.join(matched_profs)}"
            else:
                alert_type = "PROFILE_MATCH"
                dedupe_key = f"PROFILE_MATCH:{item.canonical_key}"
                summary = f"Matches {', '.join(matched_profs)}"

            candidates.append(
                AlertCandidate(
                    listing_id=lid,
                    canonical_key=item.canonical_key,
                    alert_type=alert_type,
                    dedupe_key=dedupe_key,
                    priority=3,
                    scored=item,
                    matched_profiles=matched_profs,
                    taste_score=t_score,
                    taste_reasons=t_reasons,
                    summary_reason=summary,
                )
            )

    # Sort: highest priority first (1 < 2 < 3), then highest Taste Match, then highest composite score
    candidates.sort(
        key=lambda c: (
            c.priority,
            -(c.taste_score if c.taste_score is not None else 50.0),
            -c.scored.score,
        )
    )
    return candidates


def seed_baseline_alerts(
    cfg: AppConfig,
    db: Database,
    scored_all: list[ScoredListing],
) -> dict[str, int]:
    """
    Mark all currently-matching listings as already recorded (notified=1) and snapshot
    current watchlist statuses so enabling scheduled alerts only fires on NEW listings
    and NEW price drops/changes.
    """
    candidates = evaluate_alerts(cfg, db, scored_all, update_watchlist_state=True)
    seeded = 0
    already_seen = 0
    for cand in candidates:
        alert_id, is_new = db.record_alert(
            listing_id=cand.listing_id,
            alert_type=cand.alert_type,
            dedupe_key=cand.dedupe_key,
            score=cand.taste_score if cand.taste_score is not None else cand.scored.score,
            total_monthly_cost=cand.scored.costs.total_monthly_cost,
        )
        if is_new:
            db.mark_alert_notified(alert_id)
            seeded += 1
        else:
            already_seen += 1
    return {"seeded": seeded, "already_seen": already_seen, "total_evaluated": len(candidates)}
