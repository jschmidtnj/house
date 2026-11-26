"""Tests for filtering and composite scoring engine."""

from __future__ import annotations

from house.config import BudgetConfig, SearchConfig
from house.models import ListingData
from house.scoring import score_listing


def test_monthly_cost_knob_filters_expensive_listing():
    budget = BudgetConfig(max_price=2_000_000, max_monthly_cost=8_500, down_payment_pct=20.0, interest_rate_pct=6.5)
    search = SearchConfig(boroughs=["Manhattan", "Brooklyn"], neighborhoods=[], property_types=["condo", "coop"])

    affordable = ListingData(
        source="test",
        external_id="a",
        address="110 Remsen St",
        borough="Brooklyn",
        neighborhood="Brooklyn Heights",
        property_type="coop",
        price=1_100_000,
        beds=2.0,
        baths=1.0,
        sqft=980,
        monthly_maintenance=1_600,
        amenities=["elevator", "laundry_in_unit"],
    )
    too_high_monthly = ListingData(
        source="test",
        external_id="b",
        address="315 W 23rd St",
        borough="Manhattan",
        neighborhood="Chelsea",
        property_type="condo",
        price=1_750_000,
        beds=2.0,
        baths=2.0,
        sqft=1100,
        monthly_hoa=1_500,
        monthly_tax=1_600,
    )

    res_ok = score_listing(1, "k1", affordable, budget, search)
    res_rej = score_listing(2, "k2", too_high_monthly, budget, search)

    assert res_ok.passes_filters is True
    assert res_ok.score > 50.0
    assert res_rej.passes_filters is False
    assert any("Monthly" in r for r in res_rej.rejection_reasons)


def test_price_drop_increases_score():
    budget = BudgetConfig(max_price=2_000_000, max_monthly_cost=9_500)
    search = SearchConfig(boroughs=[], neighborhoods=[], property_types=["condo"])

    item = ListingData(
        source="test",
        external_id="c",
        address="380 4th St",
        property_type="condo",
        price=1_300_000,
        beds=2.0,
        baths=2.0,
        sqft=1050,
        monthly_hoa=800,
        monthly_tax=750,
    )
    no_drop = score_listing(1, "k1", item, budget, search, initial_price=1_300_000)
    with_drop = score_listing(1, "k1", item, budget, search, initial_price=1_450_000)

    assert with_drop.price_drop_pct > 10.0
    assert with_drop.score > no_drop.score


def test_hdfc_excluded_and_zip_code_fallback_enforced():
    budget = BudgetConfig(max_price=2_000_000, max_monthly_cost=8_000, annual_income=300_000)
    search = SearchConfig(
        boroughs=["Manhattan", "Brooklyn", "Queens"],
        neighborhoods=["East Village", "Williamsburg", "Long Island City"],
        zip_codes=["10003", "11211", "11101"],
        property_types=["condo", "coop"],
        exclude_hdfc=True,
    )

    hdfc = ListingData(
        source="test",
        external_id="hdfc-1",
        address="123 E 4th St",
        borough="Manhattan",
        neighborhood="East Village",
        zip_code="10003",
        property_type="coop",
        price=650_000,
        beds=2.0,
        baths=1.0,
        monthly_maintenance=900,
        description="Gorgeous HDFC income-restricted co-op (120% AMI cap).",
    )
    out_of_area = ListingData(
        source="test",
        external_id="brighton-1",
        address="2917 Brighton 4th St",
        borough="Brooklyn",
        neighborhood="",
        zip_code="11235",
        property_type="coop",
        price=569_000,
        beds=2.0,
        baths=1.0,
        monthly_maintenance=400,
    )
    zip_fallback_ok = ListingData(
        source="test",
        external_id="lic-1",
        address="45-40 Center Blvd",
        borough="Queens",
        neighborhood="",
        zip_code="11101",
        property_type="condo",
        price=950_000,
        beds=1.0,
        baths=1.0,
        sqft=750,
        monthly_hoa=850,
        monthly_tax=650,
    )

    assert not score_listing(1, "h1", hdfc, budget, search).passes_filters
    assert not score_listing(2, "h2", out_of_area, budget, search).passes_filters
    assert score_listing(3, "h3", zip_fallback_ok, budget, search).passes_filters
