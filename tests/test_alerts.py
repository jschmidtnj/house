"""Offline tests for the smart alert engine, TasteModel, baseline seeding, and Discord embeds."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from house.alerts import (
    TasteModel,
    evaluate_alerts,
    normalize_building_key,
    seed_baseline_alerts,
)
from house.config import AlertProfileConfig, AppConfig
from house.db import Database
from house.models import ListingData
from house.notify.discord import DiscordNotifier
from house.scoring import rank_listings


def _make_listing(**overrides) -> ListingData:
    defaults = dict(
        source="homeharvest",
        external_id="ext-1",
        address="46-30 21st St",
        unit="4A",
        borough="Queens",
        neighborhood="Long Island City",
        zip_code="11101",
        property_type="condo",
        num_units=1,
        price=950_000.0,
        beds=2.0,
        baths=2.0,
        sqft=800,
        year_built=2023,
        monthly_hoa=550.0,
        monthly_maintenance=None,
        monthly_tax=500.0,
        status="active",
        url="https://example.com/listing",
        latitude=40.745,
        longitude=-73.948,
        amenities=["dishwasher", "outdoor_space", "storage"],
        description="Modern sunlit 2BR condo with floor-to-ceiling windows.",
    )
    defaults.update(overrides)
    if "raw_json" not in defaults and defaults.get("year_built") is not None:
        defaults["raw_json"] = {"year_built": defaults["year_built"]}
    return ListingData(**defaults)


def _base_cfg(db_path: Path) -> AppConfig:
    cfg = AppConfig(database_path=str(db_path))
    cfg.alerts.enabled = True
    cfg.alerts.min_price = 450_000.0
    cfg.alerts.max_fees_ratio = 0.40
    cfg.alerts.exclude_keywords = ["exposed brick", "exposed-brick"]
    cfg.alerts.taste_match.min_examples = 5
    cfg.alerts.profiles = [
        AlertProfileConfig(
            id="lic_modern_condo",
            name="LIC Modern Condo",
            zip_codes=["11101"],
            property_types=["condo"],
            min_beds=1.0,
            max_monthly_cost=7800.0,
            max_fees_ratio=0.25,
            min_year_built=2015,
            min_taste_score=50.0,
        )
    ]
    return cfg


def test_normalize_building_key_merges_queens_hyphens_and_strips_units():
    k1 = normalize_building_key("46-30 21st St", "11101")
    k2 = normalize_building_key("4630 21st Street Apt 5B", "11101-1234")
    assert k1 == k2 == "4630 21st st|11101"


def test_alerts_block_timeshares_exposed_brick_and_hidden_listings(tmp_path: Path):
    db_path = tmp_path / "test.db"
    cfg = _base_cfg(db_path)

    with Database(db_path) as db:
        db.upsert_listings(
            [
                # 1. Valid LIC modern condo (should match profile)
                _make_listing(address="41-10 27th St", unit="3C", price=960_000.0),
                # 2. Timeshare trap: low price + huge fees ratio (should be blocked)
                _make_listing(
                    address="41-12 27th St",
                    unit="9A",
                    price=180_000.0,
                    monthly_hoa=2900.0,
                    monthly_tax=100.0,
                ),
                # 3. Exposed brick listing (should be blocked)
                _make_listing(
                    address="41-14 27th St",
                    unit="2B",
                    price=920_000.0,
                    description="Charming loft with exposed brick walls throughout.",
                ),
                # 4. Hidden listing (should be blocked)
                _make_listing(address="41-16 27th St", unit="5D", price=930_000.0),
            ]
        )
        rows = db.get_listings(status=None)
        hidden_row = [r for r in rows if r.address == "41-16 27th St"][0]
        db.set_bot_state("hidden_listing_ids", json.dumps([hidden_row.id]))

        scored = rank_listings(rows, cfg.budget, cfg.search, include_rejected=True)
        cands = evaluate_alerts(cfg, db, scored, update_watchlist_state=False)

    assert len(cands) == 1
    assert cands[0].scored.listing.address == "41-10 27th St"
    assert cands[0].alert_type == "PROFILE_MATCH"
    assert cands[0].matched_profiles == ["LIC Modern Condo"]


def test_favorite_building_and_watchlist_alerts_and_baseline_seed(tmp_path: Path):
    db_path = tmp_path / "test.db"
    cfg = _base_cfg(db_path)

    with Database(db_path) as db:
        # Insert initial favorite unit at 46-30 21st St (over $7k/mo initially)
        db.upsert_listings(
            [
                _make_listing(address="46-30 21st St", unit="4A", price=1_150_000.0),
                # New unit in same building (hyphenless variant!)
                _make_listing(address="4630 21st St", unit="7B", price=920_000.0),
            ]
        )
        rows = db.get_listings(status=None)
        fav_row = [r for r in rows if r.unit == "4A"][0]
        db.set_bot_state("saved_listing_ids", json.dumps([fav_row.id]))

        # Seed baseline -> records the 7B favorite-building match & snapshots 4A status="active"
        scored = rank_listings(rows, cfg.budget, cfg.search, include_rejected=True)
        seed_res = seed_baseline_alerts(cfg, db, scored)
        assert seed_res["seeded"] == 1

        # Running notifier immediately after seed sends 0 alerts
        notifier = DiscordNotifier(cfg, db)
        with patch.object(notifier, "send_embed", return_value=True) as mock_send:
            sent = notifier.notify_candidates(
                evaluate_alerts(cfg, db, scored, update_watchlist_state=True)
            )
            assert sent == 0
            assert mock_send.call_count == 0

        # Now simulate a 10% price drop on the favorited unit 4A (bringing it below $7k/mo!)
        db.upsert_listings([_make_listing(address="46-30 21st St", unit="4A", price=1_000_000.0)])
        rows_after = db.get_listings(status=None)
        scored_after = rank_listings(rows_after, cfg.budget, cfg.search, include_rejected=True)
        cands_after = evaluate_alerts(cfg, db, scored_after, update_watchlist_state=True)

        alert_types = {c.alert_type for c in cands_after}
        assert "WATCHLIST_PRICE_DROP" in alert_types
        assert "WATCHLIST_BUDGET" in alert_types

        with patch.object(notifier, "send_embed", return_value=True) as mock_send:
            sent = notifier.notify_candidates(cands_after)
            assert sent == 2
            assert mock_send.call_count == 2


def test_taste_model_separates_modern_low_fee_condo_from_high_fee_old_coop(tmp_path: Path):
    db_path = tmp_path / "test.db"
    cfg = _base_cfg(db_path)

    pos_listings = [
        _make_listing(
            address=f"{100 + i} Hancock St",
            unit=f"{i}A",
            borough="Brooklyn",
            zip_code="11221",
            property_type="condo",
            price=820_000.0,
            beds=2.0,
            baths=2.0,
            year_built=2022,
            monthly_hoa=450.0,
            monthly_tax=350.0,
            amenities=["dishwasher", "outdoor_space", "storage"],
        )
        for i in range(6)
    ]
    neg_listings = [
        _make_listing(
            address=f"{200 + i} E 52nd St",
            unit=f"{i}B",
            borough="Manhattan",
            zip_code="10022",
            property_type="coop",
            price=600_000.0,
            beds=1.0,
            baths=1.0,
            year_built=1950,
            monthly_hoa=None,
            monthly_maintenance=1950.0,
            monthly_tax=None,
            amenities=[],
            description="Pre-war studio/1br with exposed brick.",
        )
        for i in range(6)
    ]

    with Database(db_path) as db:
        db.upsert_listings(pos_listings + neg_listings)
        rows = db.get_listings(status=None)
        scored = rank_listings(rows, cfg.budget, cfg.search, include_rejected=True)

    pos_scored = [s for s in scored if s.listing.borough == "Brooklyn"]
    neg_scored = [s for s in scored if s.listing.borough == "Manhattan"]
    model = TasteModel(pos_scored, neg_scored, min_examples=5)
    assert model.active is True

    good_score, good_reasons = model.score(pos_scored[0])
    bad_score, _ = model.score(neg_scored[0])
    assert good_score > 75.0
    assert bad_score < 25.0
    assert len(good_reasons) > 0
