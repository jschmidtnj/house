"""NYC monthly housing cost & closing cost calculator (Condo vs. Co-op vs. Townhouse)."""

from __future__ import annotations

from house.config import BudgetConfig
from house.models import BuyVsRentComparison, BuyVsRentPoint, CostBreakdown, ListingData


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
        elif ptype in ("townhouse", "multifamily"):
            monthly_fees = 0.0
        else:
            est_sqft = listing.sqft or 800
            monthly_fees = est_sqft * 1.15
            fees_estimated = True
            warnings.append("Condo common charges estimated (missing on listing)")

        if listing.monthly_tax is not None and listing.monthly_tax >= 0:
            monthly_tax = float(listing.monthly_tax)
        else:
            # NYC Tax Class 1 (1-3 family townhouses) has lower effective rate (~0.55%) than condos (~0.90%)
            tax_rate = 0.55 if ptype in ("townhouse", "multifamily") else budget.fallback_condo_tax_rate_pct
            monthly_tax = (price * (tax_rate / 100.0)) / 12.0
            tax_estimated = True
            warnings.append("Monthly property tax estimated (missing on listing)")

    monthly_insurance = (
        max(0.0, float(budget.townhouse_insurance_monthly))
        if ptype in ("townhouse", "multifamily")
        else max(0.0, float(budget.monthly_insurance_default))
    )
    total_monthly = monthly_pi + monthly_fees + monthly_tax + monthly_insurance
    fees_ratio = ((monthly_fees + monthly_tax) / total_monthly) if total_monthly > 0 else 0.0

    # Multi-unit townhouse ("house hacking") rental income offset
    num_units = max(1, int(listing.num_units or 1))
    rentable_units = max(0, num_units - 1) if ptype in ("townhouse", "multifamily") else 0
    gross_rental = rentable_units * max(0.0, float(budget.est_rent_per_unit))
    net_rental = gross_rental * max(0.0, min(1.0, float(budget.rental_net_factor)))
    net_monthly_cost = max(0.0, total_monthly - net_rental)

    if fees_ratio > budget.max_monthly_fees_ratio:
        warnings.append(
            f"High carrying fees: {fees_ratio * 100:.0f}% of monthly cost "
            f"(threshold: {budget.max_monthly_fees_ratio * 100:.0f}%)"
        )

    # Front-end housing DTI % (lenders credit ~75% of projected rental income for 2-4 unit owner-occupied)
    dti_pct: float | None = None
    if budget.annual_income and budget.annual_income > 0:
        lender_rental_credit = gross_rental * 0.75
        gross_monthly_income = (budget.annual_income / 12.0) + lender_rental_credit
        dti_pct = round((total_monthly / gross_monthly_income) * 100.0, 1)
        dti_limit = budget.coop_max_dti_pct if ptype == "coop" else budget.condo_max_dti_pct
        if dti_pct > dti_limit:
            label = "Co-op board" if ptype == "coop" else "Lender"
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
        num_units=num_units,
        rentable_units=rentable_units,
        estimated_gross_rental_income=round(gross_rental, 2),
        estimated_net_rental_income=round(net_rental, 2),
        net_monthly_cost=round(net_monthly_cost, 2),
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


def calculate_buy_vs_rent(
    listing: ListingData,
    costs: CostBreakdown,
    budget: BudgetConfig,
) -> BuyVsRentComparison:
    """
    NYT-style Buy vs. Rent wealth/net-cost simulation over `budget.hold_years`
    (with yearly trajectory from Year 1 to max(15, hold_years)).

    Compares:
    - Buying: upfront down payment + closing costs, monthly P&I (exact amortization),
      carrying fees + taxes + insurance + maintenance reserve (growing with inflation),
      tax deductions, rental income offset (for 2-3 unit townhouses), less net home
      sale proceeds after appreciation & NYC selling costs.
    - Renting: starting at `budget.current_monthly_rent` (growing at `rent_growth_pct`),
      while investing the upfront cash & any monthly cash-flow difference at
      `investment_return_pct` (compounded monthly, with ~20% effective capital gains drag).
    """
    hold_years = max(1, min(30, int(budget.hold_years)))
    max_sim_years = max(15, hold_years)
    monthly_rate = (budget.interest_rate_pct / 100.0) / 12.0
    # After-tax compounded monthly investment return (~18% drag on long-term gains/dividends)
    eff_inv_annual = (budget.investment_return_pct / 100.0) * 0.82
    inv_monthly = (1.0 + eff_inv_annual) ** (1.0 / 12.0) - 1.0

    appr_rate = budget.home_appreciation_pct / 100.0
    rent_infl = budget.rent_growth_pct / 100.0
    sell_pct = budget.selling_cost_pct / 100.0
    maint_reserve_rate = 0.010 if costs.property_type in ("townhouse", "multifamily") else 0.004

    loan_balance = costs.loan_amount
    # Portfolio the renter builds by investing upfront cash + monthly cash-flow differences
    # (negative monthly diff means buyer is cheaper that month -> renter portfolio shrinks)
    renter_portfolio = costs.estimated_cash_to_close
    total_buy_outflow = costs.estimated_cash_to_close
    total_rent_outflow = 0.0

    base_carrying = costs.monthly_hoa_or_maint + costs.monthly_tax + costs.monthly_insurance
    base_rent = max(0.0, float(budget.current_monthly_rent))
    base_net_rental_income = costs.estimated_net_rental_income
    tax_savings_base_ratio = (
        max(0.0, costs.total_monthly_cost - costs.effective_after_tax_monthly) / costs.total_monthly_cost
        if costs.total_monthly_cost > 0
        else 0.0
    )

    series: list[BuyVsRentPoint] = []
    breakeven_year: int | None = None
    hold_buy_net = 0.0
    hold_rent_net = 0.0
    hold_buy_adv = 0.0

    for year in range(1, max_sim_years + 1):
        infl_factor = (1.0 + rent_infl) ** (year - 1)
        cur_rent = base_rent * infl_factor
        cur_carrying = base_carrying * infl_factor
        cur_maint_reserve = (costs.purchase_price * ((1.0 + appr_rate) ** (year - 1)) * maint_reserve_rate) / 12.0
        cur_rental_offset = base_net_rental_income * infl_factor

        for _ in range(12):
            interest = loan_balance * monthly_rate if loan_balance > 0 else 0.0
            principal = max(0.0, min(loan_balance, costs.monthly_mortgage_pi - interest))
            loan_balance = max(0.0, loan_balance - principal)

            # Rough monthly tax savings scaled by remaining interest share
            tax_savings = (costs.monthly_mortgage_pi + costs.monthly_tax) * tax_savings_base_ratio * 0.85
            buy_cash_mo = (
                costs.monthly_mortgage_pi
                + cur_carrying
                + cur_maint_reserve
                - cur_rental_offset
                - tax_savings
            )
            total_buy_outflow += buy_cash_mo
            total_rent_outflow += cur_rent

            # Renter compounds portfolio and invests (buy_cash_mo - cur_rent) each month
            renter_portfolio = renter_portfolio * (1.0 + inv_monthly) + (buy_cash_mo - cur_rent)

        home_value = costs.purchase_price * ((1.0 + appr_rate) ** year)
        net_sale_proceeds = home_value * (1.0 - sell_pct) - loan_balance

        # Net wealth delta: Buyer ends with `net_sale_proceeds`; Renter ends with `renter_portfolio`
        # (both paths had the exact same monthly consumption cash budget!).
        # Express as equivalent "net cost" over the period for intuitive NYT-style comparison:
        buy_advantage = net_sale_proceeds - renter_portfolio
        buy_net_cost = total_buy_outflow - net_sale_proceeds
        rent_net_cost = buy_net_cost + buy_advantage

        if breakeven_year is None and buy_advantage >= 0:
            breakeven_year = year

        series.append(
            BuyVsRentPoint(
                year=year,
                buy_net_cost=round(buy_net_cost, 0),
                rent_net_cost=round(rent_net_cost, 0),
                buy_advantage=round(buy_advantage, 0),
            )
        )
        if year == hold_years:
            hold_buy_net = buy_net_cost
            hold_rent_net = rent_net_cost
            hold_buy_adv = buy_advantage

    # NYT headline equivalent monthly rent:
    # Current rent + annualized monthly delta needed to make buying & renting break even at hold_years
    months = hold_years * 12
    equiv_rent = max(0.0, base_rent - (hold_buy_adv / months))

    if hold_buy_adv >= 25_000:
        verdict = "BUY_WINS"
    elif hold_buy_adv <= -25_000:
        verdict = "RENT_WINS"
    else:
        verdict = "CLOSE_CALL"

    return BuyVsRentComparison(
        hold_years=hold_years,
        current_monthly_rent=round(base_rent, 0),
        equivalent_monthly_rent=round(equiv_rent, 0),
        buy_total_net_cost=round(hold_buy_net, 0),
        rent_total_net_cost=round(hold_rent_net, 0),
        net_advantage_buy=round(hold_buy_adv, 0),
        breakeven_year=breakeven_year,
        verdict=verdict,
        yearly_series=series,
    )
