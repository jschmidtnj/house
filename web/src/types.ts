export interface BudgetConfig {
  annual_income: number | null;
  max_price: number;
  min_price: number;
  max_monthly_cost: number;
  coop_max_dti_pct: number;
  condo_max_dti_pct: number;
  down_payment_pct: number;
  max_cash_down: number | null;
  interest_rate_pct: number;
  loan_term_years: number;
  monthly_insurance_default: number;
  use_after_tax_for_filter: boolean;
  est_rent_per_unit: number;
  rental_net_factor: number;
  use_net_rental_for_filter: boolean;
}

export interface SearchConfig {
  boroughs: string[];
  neighborhoods: string[];
  zip_codes: string[];
  property_types: string[];
  min_units: number;
  max_units: number;
  exclude_hdfc: boolean;
  exclude_land_lease: boolean;
  min_beds: number;
  min_baths: number;
  min_sqft: number;
}

export interface ConfigResponse {
  budget: BudgetConfig;
  search: SearchConfig;
  status: {
    listings_total: number;
    listings_active: number;
    price_history: number;
    alerts: number;
    last_poll_at: string | null;
    last_run_at: string | null;
  };
}

export interface CostBreakdown {
  purchase_price: number;
  property_type: string;
  down_payment_amount: number;
  down_payment_pct: number;
  loan_amount: number;
  interest_rate_pct: number;
  loan_term_years: number;
  monthly_mortgage_pi: number;
  monthly_hoa_or_maint: number;
  monthly_tax: number;
  monthly_insurance: number;
  total_monthly_cost: number;
  num_units: number;
  rentable_units: number;
  estimated_gross_rental_income: number;
  estimated_net_rental_income: number;
  net_monthly_cost: number;
  effective_after_tax_monthly: number;
  monthly_fees_ratio: number;
  dti_pct: number | null;
  estimated_closing_costs: number;
  mansion_tax: number;
  estimated_cash_to_close: number;
  tax_estimated: boolean;
  fees_estimated: boolean;
  warnings: string[];
}

export interface ListingItem {
  address: string;
  unit: string;
  borough: string;
  neighborhood: string;
  zip_code: string;
  property_type: string;
  num_units: number;
  price: number;
  beds: number;
  baths: number;
  sqft: number | null;
  monthly_hoa: number | null;
  monthly_maintenance: number | null;
  monthly_tax: number | null;
  status: string;
  days_on_market: number | null;
  url: string;
  latitude: number | null;
  longitude: number | null;
  photo_url: string;
  amenities: string[];
  description: string;
}

export interface ScoredListing {
  id: number;
  canonical_key: string;
  score: number;
  passes_filters: boolean;
  rejection_reasons: string[];
  score_components: Record<string, number>;
  price_drop_pct: number;
  initial_price: number | null;
  sources: string[];
  price_per_sqft: number | null;
  listing: ListingItem;
  costs: CostBreakdown;
}

export interface RankSummary {
  total_active: number;
  total_returned: number;
  matching_count: number;
  with_coordinates: number;
  avg_monthly_cost: number;
  avg_price: number;
}

export interface RankResponse {
  summary: RankSummary;
  listings: ScoredListing[];
}

export interface KnobsState {
  annual_income: number;
  max_monthly_cost: number;
  max_price: number;
  down_payment_pct: number;
  interest_rate_pct: number;
  loan_term_years: number;
  use_after_tax_for_filter: boolean;
  est_rent_per_unit: number;
  use_net_rental_for_filter: boolean;
  min_units: number;
  min_beds: number;
  min_sqft: number;
  property_types: string[];
  exclude_hdfc: boolean;
  exclude_land_lease: boolean;
  show_rejected: boolean;
  search_query: string;
}
