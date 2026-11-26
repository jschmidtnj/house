"""NYC monthly housing cost & closing cost calculator (Condo vs. Co-op vs. Townhouse)."""

from __future__ import annotations

from house.config import BudgetConfig
from house.models import CostBreakdown, ListingData


def calculate_monthly_mortgage_pi(
    loan_amount: float,
    annual_rate_pct: float,
    loan_term_years: int = 30,
) -> float:
    """Standard fixed-rate monthly Principal & Interest (P&I) payment."""
    if loan_amount <= 0 or loan_term_years <= 0:
        return 0.0
    n_months = loan_term_years * 12
    monthly_rate = (annual_rate_pct / 100.0) / 12.0
    if monthly_rate <= 0:
        return loan_amount / n_months
    factor = (1.0 + monthly_rate) ** n_months
    return loan_amount * (monthly_rate * factor) / (factor - 1.0)


def calculate_nyc_mansion_tax(purchase_price: float) -> float:
    """NYC progressive Mansion Tax schedule (applies to residential purchases >= $1M)."""
    if purchase_price < 1_000_000:
        return 0.0
    if purchase_price < 2_000_000:
        return purchase_price * 0.0100
    if purchase_price < 3_000_000:
        return purchase_price * 0.0125
    if purchase_price < 5_000_000:
        return purchase_price * 0.0150
    if purchase_price < 10_000_000:
        return purchase_price * 0.0225
    if purchase_price < 15_000_000:
        return purchase_price * 0.0325
    if purchase_price < 20_000_000:
        return purchase_price * 0.0350
    if purchase_price < 25_000_000:
        return purchase_price * 0.0375
    return purchase_price * 0.0390


def calculate_nyc_closing_costs(
    purchase_price: float,
    loan_amount: float,
    property_type: str,
) -> tuple[float, float]:
    """
    Estimate buyer closing costs in NYC (returns `(total_closing_costs, mansion_tax)`).

    - Co-ops do NOT pay NYC Mortgage Recording Tax or title insurance (typically ~1.5-2% + mansion tax).
    - Condos/Townhouses pay NYC Mortgage Recording Tax (~1.8% on loans < $500k, ~1.925% on >= $500k)
      plus title insurance (~0.45%) + attorney/misc (~$5k) + mansion tax.
    """
    mansion_tax = calculate_nyc_mansion_tax(purchase_price)
    ptype = (property_type or "condo").lower()

    attorney_and_misc = 5_000.0
    if ptype == "coop":
        board_and_misc = 2_500.0
        total = mansion_tax + attorney_and_misc + board_and_misc
    else:
        mrt_rate = 0.01925 if loan_amount >= 500_000 else 0.0180
        mortgage_recording_tax = loan_amount * mrt_rate if loan_amount > 0 else 0.0
        title_insurance = purchase_price * 0.0045
        total = mansion_tax + mortgage_recording_tax + title_insurance + attorney_and_misc

    return round(total, 2), round(mansion_tax, 2)


def calculate_cost_breakdown(listing: ListingData, budget: BudgetConfig) -> CostBreakdown:
    """
    Compute full NYC monthly housing cost and cash-to-close for a listing.

    Key NYC distinction:
    - Co-op: `monthly_maintenance` ALREADY includes building property taxes (do not double-count).
    - Condo / Condop / Townhouse: `monthly_hoa` (common charges) + separate `monthly_tax`.
    """
    price = max(0.0, float(listing.price))
    ptype = (listing.property_type or "condo").lower()
    warnings: list[str] = []

    # Down payment calculation (respect optional max_cash_down cap)
    down_pct = max(0.0, min(100.0, float(budget.down_payment_pct)))
    down_amount = price * (down_pct / 100.0)
    if budget.max_cash_down is not None and down_amount > budget.max_cash_down:
        down_amount = max(0.0, float(budget.max_cash_down))
        down_pct = (down_amount / price * 100.0) if price > 0 else 0.0

    if ptype == "coop" and down_pct + 1e-6 < budget.coop_min_down_pct:
        warnings.append(
            f"Co-op typically requires >= {budget.coop_min_down_pct:.0f}% down "
            f"(current: {down_pct:.1f}%)"
        )

    loan_amount = max(0.0, price - down_amount)
    monthly_pi = calculate_monthly_mortgage_pi(
        loan_amount,
        budget.interest_rate_pct,
        budget.loan_term_years,
    )

    fees_estimated = False
    tax_estimated = False

    if ptype == "coop":
        # Co-op maintenance already bundles property taxes
        if listing.monthly_maintenance is not None and listing.monthly_maintenance > 0:
            monthly_fees = float(listing.monthly_maintenance)
        elif listing.monthly_hoa is not None and listing.monthly_hoa > 0:
            monthly_fees = float(listing.monthly_hoa)
        else:
            est_sqft = listing.sqft or 800
            monthly_fees = est_sqft * budget.fallback_coop_maint_per_sqft
            fees_estimated = True
            warnings.append("Co-op maintenance estimated from sqft (missing on listing)")
        monthly_tax = 0.0
    else:
        # Condo / Condop / Townhouse: separate common charges (HOA) and monthly real estate tax
        if listing.monthly_hoa is not None:
            monthly_fees = float(listing.monthly_hoa)
        elif listing.monthly_maintenance is not None:
            monthly_fees = float(listing.monthly_maintenance)
        elif ptype == "townhouse":
            monthly_fees = 0.0
        else:
            est_sqft = listing.sqft or 800
            monthly_fees = est_sqft * 1.15
            fees_estimated = True
            warnings.append("Condo common charges estimated (missing on listing)")

        if listing.monthly_tax is not None and listing.monthly_tax >= 0:
            monthly_tax = float(listing.monthly_tax)
        else:
            monthly_tax = (price * (budget.fallback_condo_tax_rate_pct / 100.0)) / 12.0
            tax_estimated = True
            warnings.append("Monthly property tax estimated (missing on listing)")

    monthly_insurance = max(0.0, float(budget.monthly_insurance_default))
    total_monthly = monthly_pi + monthly_fees + monthly_tax + monthly_insurance
    fees_ratio = ((monthly_fees + monthly_tax) / total_monthly) if total_monthly > 0 else 0.0

    if fees_ratio > budget.max_monthly_fees_ratio:
        warnings.append(
            f"High carrying fees: {fees_ratio * 100:.0f}% of monthly cost "
            f"(threshold: {budget.max_monthly_fees_ratio * 100:.0f}%)"
        )

    # Front-end housing DTI % (gross monthly housing / gross monthly income)
    dti_pct: float | None = None
    if budget.annual_income and budget.annual_income > 0:
        gross_monthly_income = budget.annual_income / 12.0
        dti_pct = round((total_monthly / gross_monthly_income) * 100.0, 1)
        dti_limit = budget.coop_max_dti_pct if ptype == "coop" else budget.condo_max_dti_pct
        if dti_pct > dti_limit:
            label = "Co-op board" if ptype == "coop" else "Condo lender"
            warnings.append(
                f"Housing DTI {dti_pct:.1f}% exceeds typical {label} cap ({dti_limit:.0f}%)"
            )

    desc_lower = (listing.description or "").lower()
    if any(k in desc_lower for k in ("land lease", "land-lease", "ground lease")):
        warnings.append("Land-lease building (higher risk of future maintenance hikes / financing limits)")

    # Rough effective after-tax monthly cost (Year-1 interest on up to $750k loan + deductible portion)
    deductible_loan = min(loan_amount, 750_000.0)
    year1_monthly_interest = (deductible_loan * (budget.interest_rate_pct / 100.0)) / 12.0
    if ptype == "coop":
        deductible_maint = monthly_fees * budget.coop_tax_deductible_pct
        # Cap SALT-adjacent property tax portion conservatively at $10k/yr (~$833/mo)
        deductible_monthly = year1_monthly_interest + min(deductible_maint, 833.33)
    else:
        deductible_monthly = year1_monthly_interest + min(monthly_tax, 833.33)

    tax_savings = deductible_monthly * (budget.marginal_tax_rate_pct / 100.0)
    effective_after_tax = max(0.0, total_monthly - tax_savings)

    closing_costs, mansion_tax = calculate_nyc_closing_costs(price, loan_amount, ptype)
    cash_to_close = down_amount + closing_costs

    return CostBreakdown(
        purchase_price=round(price, 2),
        property_type=ptype,
        down_payment_amount=round(down_amount, 2),
        down_payment_pct=round(down_pct, 2),
        loan_amount=round(loan_amount, 2),
        interest_rate_pct=budget.interest_rate_pct,
        loan_term_years=budget.loan_term_years,
        monthly_mortgage_pi=round(monthly_pi, 2),
        monthly_hoa_or_maint=round(monthly_fees, 2),
        monthly_tax=round(monthly_tax, 2),
        monthly_insurance=round(monthly_insurance, 2),
        total_monthly_cost=round(total_monthly, 2),
        effective_after_tax_monthly=round(effective_after_tax, 2),
        monthly_fees_ratio=round(fees_ratio, 4),
        dti_pct=dti_pct,
        estimated_closing_costs=closing_costs,
        mansion_tax=mansion_tax,
        estimated_cash_to_close=round(cash_to_close, 2),
        tax_estimated=tax_estimated,
        fees_estimated=fees_estimated,
        warnings=warnings,
    )
