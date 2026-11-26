"""Tests for NYC monthly housing cost & closing cost calculations."""

from __future__ import annotations

from house.config import BudgetConfig
from house.finance import (
    calculate_cost_breakdown,
    calculate_monthly_mortgage_pi,
    calculate_nyc_mansion_tax,
)
from house.models import ListingData


def test_mortgage_pi_standard_30yr():
    # $1,000,000 loan at 6.5% for 30 years -> ~$6,320.68/mo
    pi = calculate_monthly_mortgage_pi(1_000_000, 6.5, 30)
    assert 6319.0 < pi < 6322.0


def test_condo_vs_coop_no_double_counting_tax():
    budget = BudgetConfig(
        down_payment_pct=20.0,
        interest_rate_pct=6.5,
        loan_term_years=30,
        monthly_insurance_default=150.0,
    )
    coop = ListingData(
        source="test",
        external_id="1",
        address="100 Main St",
        property_type="coop",
        price=1_200_000,
        monthly_maintenance=2_200,
        monthly_tax=900,  # Should be ignored for co-op (bundled in maintenance)
    )
    condo = ListingData(
        source="test",
        external_id="2",
        address="200 Main St",
        property_type="condo",
        price=1_200_000,
        monthly_hoa=1_100,
        monthly_tax=900,
    )

    coop_costs = calculate_cost_breakdown(coop, budget)
    condo_costs = calculate_cost_breakdown(condo, budget)

    assert coop_costs.monthly_tax == 0.0
    assert coop_costs.monthly_hoa_or_maint == 2_200.0
    assert condo_costs.monthly_tax == 900.0
    assert condo_costs.monthly_hoa_or_maint == 1_100.0
    # Co-op has lower closing costs (no mortgage recording tax or title insurance)
    assert coop_costs.estimated_closing_costs < condo_costs.estimated_closing_costs


def test_max_cash_down_cap_triggers_coop_warning():
    budget = BudgetConfig(
        down_payment_pct=20.0,
        max_cash_down=200_000,
        coop_min_down_pct=20.0,
    )
    coop = ListingData(
        source="test",
        external_id="3",
        address="300 West End Ave",
        property_type="coop",
        price=1_500_000,
        monthly_maintenance=2_000,
    )
    costs = calculate_cost_breakdown(coop, budget)
    assert costs.down_payment_amount == 200_000.0
    assert costs.loan_amount == 1_300_000.0
    assert any("Co-op typically requires" in w for w in costs.warnings)


def test_nyc_mansion_tax_tiers():
    assert calculate_nyc_mansion_tax(999_000) == 0.0
    assert calculate_nyc_mansion_tax(1_500_000) == 15_000.0
    assert calculate_nyc_mansion_tax(2_000_000) == 25_000.0


def test_dti_calculation_and_coop_board_warning():
    budget = BudgetConfig(
        annual_income=300_000,
        down_payment_pct=20.0,
        interest_rate_pct=6.5,
        coop_max_dti_pct=28.0,
    )
    coop = ListingData(
        source="test",
        external_id="dti-1",
        address="100 E 4th St",
        property_type="coop",
        price=1_250_000,
        monthly_maintenance=2_200,
    )
    costs = calculate_cost_breakdown(coop, budget)
    assert costs.dti_pct is not None
    assert costs.dti_pct > 28.0
    assert any("Co-op board" in w for w in costs.warnings)


def test_multifamily_townhouse_rental_offset():
    budget = BudgetConfig(
        annual_income=300_000,
        down_payment_pct=20.0,
        interest_rate_pct=6.5,
        est_rent_per_unit=3_200.0,
        rental_net_factor=0.85,
        use_net_rental_for_filter=True,
    )
    townhouse = ListingData(
        source="test",
        external_id="th-3u",
        address="220 Macon St",
        borough="Brooklyn",
        neighborhood="Bedford-Stuyvesant",
        property_type="multifamily",
        num_units=3,
        price=1_650_000,
        beds=5.0,
        baths=3.0,
        sqft=2800,
        monthly_tax=550,
    )
    costs = calculate_cost_breakdown(townhouse, budget)
    assert costs.num_units == 3
    assert costs.rentable_units == 2
    assert costs.estimated_gross_rental_income == 6_400.0
    assert costs.estimated_net_rental_income == 5_440.0
    assert costs.net_monthly_cost < costs.total_monthly_cost - 5_000.0
    assert costs.monthly_hoa_or_maint == 0.0
