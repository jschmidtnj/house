"""Normalized domain dataclasses for listings, monthly cost breakdowns, and scored results."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ListingData:
    """Normalized apartment listing ingested from any source."""

    source: str
    external_id: str
    address: str
    unit: str = ""
    borough: str = ""
    neighborhood: str = ""
    zip_code: str = ""
    property_type: str = "condo"  # condo | coop | condop | townhouse | multifamily
    num_units: int = 1            # 1 for apartment/single-family; 2-4 for multi-unit townhouse
    price: float = 0.0
    beds: float = 0.0
    baths: float = 0.0
    sqft: int | None = None
    monthly_hoa: float | None = None          # Condo common charges
    monthly_maintenance: float | None = None  # Co-op maintenance (includes taxes)
    monthly_tax: float | None = None          # Separate property tax (Condo/Townhouse)
    status: str = "active"                    # active | in_contract | sold | off_market
    days_on_market: int | None = None
    url: str = ""
    latitude: float | None = None
    longitude: float | None = None
    photo_url: str = ""
    amenities: list[str] = field(default_factory=list)
    description: str = ""
    raw_json: dict[str, Any] = field(default_factory=dict)


@dataclass
class CostBreakdown:
    """Detailed NYC monthly housing cost & upfront cash breakdown."""

    purchase_price: float
    property_type: str
    down_payment_amount: float
    down_payment_pct: float
    loan_amount: float
    interest_rate_pct: float
    loan_term_years: int

    # Monthly components
    monthly_mortgage_pi: float
    monthly_hoa_or_maint: float
    monthly_tax: float
    monthly_insurance: float
    total_monthly_cost: float

    # Multi-unit townhouse rental income offset ("house hacking")
    num_units: int
    rentable_units: int
    estimated_gross_rental_income: float
    estimated_net_rental_income: float
    net_monthly_cost: float

    # Derived / advisory metrics
    effective_after_tax_monthly: float
    monthly_fees_ratio: float          # (hoa/maint + tax) / total_monthly_cost
    dti_pct: float | None              # Front-end housing DTI % (total_monthly / gross_monthly_income)
    estimated_closing_costs: float
    mansion_tax: float
    estimated_cash_to_close: float

    # Flags / warnings
    tax_estimated: bool = False
    fees_estimated: bool = False
    warnings: list[str] = field(default_factory=list)


@dataclass
class ScoredListing:
    """A listing paired with its cost breakdown, eligibility, and composite score."""

    listing_id: int
    canonical_key: str
    listing: ListingData
    costs: CostBreakdown
    score: float                       # 0.0 - 100.0
    passes_filters: bool
    rejection_reasons: list[str] = field(default_factory=list)
    score_components: dict[str, float] = field(default_factory=dict)
    price_drop_pct: float = 0.0
    initial_price: float | None = None
    sources: list[str] = field(default_factory=list)
