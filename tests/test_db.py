"""Tests for SQLAlchemy ORM persistence, cross-source deduplication, and price drops."""

from __future__ import annotations

import json

from house.db import Database, make_canonical_key
from house.models import ListingData


def test_canonical_key_normalizes_street_abbreviations():
    k1 = make_canonical_key("245 West 75th Street", "Apt 6B")
    k2 = make_canonical_key("245 W 75th St, New York, NY", "#6b")
    assert k1 == k2


def test_cross_source_dedup_and_price_drop_tracking():
    with Database(":memory:") as db:
        first = ListingData(
            source="streeteasy_rapidapi",
            external_id="se-1",
            address="245 West 75th Street",
            unit="6B",
            borough="Manhattan",
            neighborhood="Upper West Side",
            property_type="coop",
            price=1_400_000,
            beds=2.0,
            baths=1.5,
            sqft=1050,
            monthly_maintenance=2_100,
            url="https://streeteasy.com/example/6b",
        )
        lid1, is_new1, drop1 = db.upsert_listing(first)
        assert is_new1 is True
        assert drop1 == 0.0

        second = ListingData(
            source="rentcast",
            external_id="rc-999",
            address="245 W 75th St",
            unit="Apt 6B",
            property_type="coop",
            price=1_330_000,  # 5% drop
            beds=2.0,
            baths=1.5,
        )
        lid2, is_new2, drop2 = db.upsert_listing(second)
        assert lid2 == lid1
        assert is_new2 is False
        assert drop2 == 5.0

        row = db.get_listing(lid1)
        assert row is not None
        assert row.price == 1_330_000
        assert row.initial_price == 1_400_000
        assert set(json.loads(row.sources_json)) == {"rentcast", "streeteasy_rapidapi"}
        assert len(db.get_price_history(lid1)) == 2


def test_alert_deduplication():
    with Database(":memory:") as db:
        item = ListingData(
            source="test",
            external_id="1",
            address="100 Broadway",
            unit="4A",
            price=1_000_000,
        )
        lid, _, _ = db.upsert_listing(item)
        aid1, new1 = db.record_alert(lid, "NEW_MATCH", "NEW_MATCH:k1", 75.0, 6500.0)
        aid2, new2 = db.record_alert(lid, "NEW_MATCH", "NEW_MATCH:k1", 75.0, 6500.0)
        assert new1 is True
        assert new2 is False
        assert aid1 == aid2


def test_reconcile_marks_missing_listings_off_market_and_reactivates_on_relist():
    with Database(":memory:") as db:
        a = ListingData(
            source="homeharvest",
            external_id="hh-1",
            address="100 Bedford Ave",
            unit="4A",
            zip_code="11249",
            price=1_100_000,
        )
        b = ListingData(
            source="homeharvest",
            external_id="hh-2",
            address="200 Bedford Ave",
            unit="5B",
            zip_code="11249",
            price=1_200_000,
        )
        local = ListingData(
            source="local_import",
            external_id="loc-1",
            address="300 Bedford Ave",
            unit="2C",
            zip_code="11249",
            price=950_000,
        )
        db.upsert_listings([a, b, local])
        assert len(db.get_listings(status="active")) == 3

        # Next homeharvest poll only sees `a` -> `b` becomes off_market, `local` stays active
        summary = db.upsert_listings([a], reconcile_source="homeharvest", min_seen_to_reconcile=1)
        assert summary["marked_off_market"] == 1
        active_addrs = {r.address for r in db.get_listings(status="active")}
        assert active_addrs == {"100 Bedford Ave", "300 Bedford Ave"}

        # If `b` comes back on the market later, it flips back to active
        db.upsert_listings([a, b], reconcile_source="homeharvest", min_seen_to_reconcile=1)
        assert len(db.get_listings(status="active")) == 3


def test_reconcile_respects_allowed_zips_and_past_days_window():
    with Database(":memory:") as db:
        in_zip_fresh = ListingData(
            source="homeharvest",
            external_id="hh-fresh",
            address="100 Bedford Ave",
            unit="1A",
            zip_code="11249",
            price=1_100_000,
            days_on_market=10,
        )
        in_zip_missing = ListingData(
            source="homeharvest",
            external_id="hh-gone",
            address="102 Bedford Ave",
            unit="2A",
            zip_code="11249",
            price=1_050_000,
            days_on_market=12,
        )
        in_zip_aged_out = ListingData(
            source="homeharvest",
            external_id="hh-old",
            address="104 Bedford Ave",
            unit="3A",
            zip_code="11249",
            price=990_000,
            days_on_market=44,
        )
        unpolled_zip = ListingData(
            source="homeharvest",
            external_id="hh-unpolled",
            address="21-20 23 Dr",
            unit="",
            zip_code="11105",
            price=1_799_000,
            days_on_market=8,
        )
        db.upsert_listings([in_zip_fresh, in_zip_missing, in_zip_aged_out, unpolled_zip])

        # Only zip 11249 completed cleanly, with past_days=45.
        # Only `in_zip_missing` (dom=12) should be marked off_market:
        # - `in_zip_aged_out` (dom=44) is protected by the past_days=45 window
        # - `unpolled_zip` (zip 11105) is protected because 11105 wasn't in reconcile_zips
        summary = db.upsert_listings(
            [in_zip_fresh],
            reconcile_source="homeharvest",
            min_seen_to_reconcile=1,
            reconcile_zips={"11249"},
            reconcile_max_dom=45,
        )
        assert summary["marked_off_market"] == 1
        statuses = {r.address: r.status for r in db.get_listings(status=None)}
        assert statuses == {
            "100 Bedford Ave": "active",
            "102 Bedford Ave": "off_market",
            "104 Bedford Ave": "active",
            "21-20 23 Dr": "active",
        }

        # Empty reconcile_zips (e.g. every zip hit limit or failed) marks nothing off_market
        summary_empty = db.upsert_listings(
            [in_zip_fresh],
            reconcile_source="homeharvest",
            min_seen_to_reconcile=1,
            reconcile_zips=set(),
        )
        assert summary_empty["marked_off_market"] == 0


def test_unitless_condos_same_building_do_not_collide():
    from house.sources.homeharvest_source import parse_homeharvest_row

    # 1. Description unit extraction pulls "3910" from "Residence 3910"
    parsed = parse_homeharvest_row(
        {
            "street": "3 Court Sq",
            "unit": None,
            "zip_code": "11101",
            "style": "CONDOS",
            "list_price": 1_850_000,
            "beds": 2,
            "full_baths": 2,
            "sqft": 972,
            "property_id": "9078950253",
            "text": "Perched high above LIC, Residence 3910 is a sunny 2BR condo.",
        }
    )
    assert parsed is not None
    assert parsed.unit == "3910"

    # 2. Still-unitless condos with different external_ids stay separate rows (no Franken-listing)
    with Database(":memory:") as db:
        u1 = ListingData(
            source="homeharvest",
            external_id="pid-1",
            address="3 Court Sq",
            unit="",
            zip_code="11101",
            property_type="condo",
            price=1_850_000,
            beds=2.0,
            baths=2.0,
        )
        u2 = ListingData(
            source="homeharvest",
            external_id="pid-2",
            address="3 Court Sq",
            unit="",
            zip_code="11101",
            property_type="condo",
            price=660_400,
            beds=1.0,
            baths=1.0,
        )
        summary = db.upsert_listings([u1, u2])
        assert summary["inserted"] == 2
        assert summary["price_drops"] == 0
        assert len(db.get_listings(status="active")) == 2
