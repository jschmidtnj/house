import type { KnobsState } from "../types";

export interface UrlUiState {
  selectedId: number | null;
  activeList: string | null;
  selectedBoroughs: string[];
  selectedNeighborhoods: string[];
  tab: "map" | "analytics";
}

function readNumber(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readBool(params: URLSearchParams, key: string): boolean | null {
  const raw = params.get(key);
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function readCsv(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseUrlUiState(search: string): UrlUiState {
  const params = new URLSearchParams(search);
  const rawListing = readNumber(params, "listing");
  const selectedId =
    rawListing != null && Number.isInteger(rawListing) && rawListing > 0 ? rawListing : null;
  const activeList = params.get("list") || null;
  const selectedBoroughs = readCsv(params, "boroughs");
  const selectedNeighborhoods = readCsv(params, "hoods");
  const tab = params.get("tab") === "analytics" ? "analytics" : "map";

  return {
    selectedId,
    activeList,
    selectedBoroughs,
    selectedNeighborhoods,
    tab,
  };
}

export function applyUrlKnobs(base: KnobsState, search: string): KnobsState {
  const params = new URLSearchParams(search);
  const next: KnobsState = { ...base };

  const numMap: Array<[string, keyof KnobsState]> = [
    ["income", "annual_income"],
    ["max_mo", "max_monthly_cost"],
    ["max_price", "max_price"],
    ["down", "down_payment_pct"],
    ["rate", "interest_rate_pct"],
    ["term", "loan_term_years"],
    ["rent_unit", "est_rent_per_unit"],
    ["cur_rent", "current_monthly_rent"],
    ["hold", "hold_years"],
    ["apprec", "home_appreciation_pct"],
    ["rent_grow", "rent_growth_pct"],
    ["inv_ret", "investment_return_pct"],
    ["units", "min_units"],
    ["beds", "min_beds"],
    ["sqft", "min_sqft"],
    ["min_yr", "min_year_built"],
    ["max_yr", "max_year_built"],
    ["commute", "max_commute_minutes"],
    ["path", "nj_max_walk_to_path_min"],
  ];

  for (const [param, field] of numMap) {
    const v = readNumber(params, param);
    if (v != null) {
      (next[field] as number) = v;
    }
  }

  const boolMap: Array<[string, keyof KnobsState]> = [
    ["after_tax", "use_after_tax_for_filter"],
    ["net_rent", "use_net_rental_for_filter"],
    ["hdfc", "exclude_hdfc"],
    ["land_lease", "exclude_land_lease"],
    ["rejected", "show_rejected"],
  ];

  for (const [param, field] of boolMap) {
    const v = readBool(params, param);
    if (v != null) {
      (next[field] as boolean) = v;
    }
  }

  const types = readCsv(params, "types");
  if (types.length > 0) {
    next.property_types = types;
  }

  const q = params.get("q");
  if (q != null) {
    next.search_query = q;
  }

  return next;
}

export function buildUrlSearch(
  knobs: KnobsState,
  base: KnobsState,
  ui: UrlUiState
): string {
  const params = new URLSearchParams();

  if (ui.selectedId != null) params.set("listing", String(ui.selectedId));
  if (ui.tab === "analytics") params.set("tab", "analytics");
  if (ui.activeList) params.set("list", ui.activeList);
  if (ui.selectedBoroughs.length > 0) params.set("boroughs", ui.selectedBoroughs.join(","));
  if (ui.selectedNeighborhoods.length > 0) params.set("hoods", ui.selectedNeighborhoods.join(","));
  if (knobs.search_query.trim()) params.set("q", knobs.search_query.trim());

  const numMap: Array<[string, keyof KnobsState]> = [
    ["income", "annual_income"],
    ["max_mo", "max_monthly_cost"],
    ["max_price", "max_price"],
    ["down", "down_payment_pct"],
    ["rate", "interest_rate_pct"],
    ["term", "loan_term_years"],
    ["rent_unit", "est_rent_per_unit"],
    ["cur_rent", "current_monthly_rent"],
    ["hold", "hold_years"],
    ["apprec", "home_appreciation_pct"],
    ["rent_grow", "rent_growth_pct"],
    ["inv_ret", "investment_return_pct"],
    ["units", "min_units"],
    ["beds", "min_beds"],
    ["sqft", "min_sqft"],
    ["min_yr", "min_year_built"],
    ["max_yr", "max_year_built"],
    ["commute", "max_commute_minutes"],
    ["path", "nj_max_walk_to_path_min"],
  ];

  for (const [param, field] of numMap) {
    if (knobs[field] !== base[field]) {
      params.set(param, String(knobs[field]));
    }
  }

  const boolMap: Array<[string, keyof KnobsState]> = [
    ["after_tax", "use_after_tax_for_filter"],
    ["net_rent", "use_net_rental_for_filter"],
    ["hdfc", "exclude_hdfc"],
    ["land_lease", "exclude_land_lease"],
    ["rejected", "show_rejected"],
  ];

  for (const [param, field] of boolMap) {
    if (knobs[field] !== base[field]) {
      params.set(param, knobs[field] ? "1" : "0");
    }
  }

  const curTypes = [...knobs.property_types].sort().join(",");
  const baseTypes = [...base.property_types].sort().join(",");
  if (curTypes !== baseTypes) {
    params.set("types", knobs.property_types.join(","));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
