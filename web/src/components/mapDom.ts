import { MTA_COLORS, SCORE_TIERS } from "../config";
import type { ScoredListing } from "../types";

export { MTA_COLORS };

export function formatShortMonthly(val: number): string {
  return `$${(val / 1000).toFixed(1)}k`;
}

export function pinColors(item: ScoredListing, isSelected: boolean): { bg: string; fg: string } {
  if (isSelected) return SCORE_TIERS.colors.selected;
  if (!item.passes_filters) return SCORE_TIERS.colors.rejected;
  if (item.score >= SCORE_TIERS.topMin) return SCORE_TIERS.colors.top;
  if (item.score >= SCORE_TIERS.goodMin) return SCORE_TIERS.colors.good;
  return SCORE_TIERS.colors.match;
}

export function createListingPinElement(item: ScoredListing, isSelected: boolean): HTMLElement {
  const pin = pinColors(item, isSelected);
  const shownMonthly =
    item.costs.rentable_units > 0 ? item.costs.net_monthly_cost : item.costs.total_monthly_cost;

  const el = document.createElement("div");
  el.className = isSelected ? "map-price-pin map-price-pin-selected" : "map-price-pin";
  el.style.backgroundColor = pin.bg;
  el.style.color = pin.fg;
  el.textContent = `${item.costs.rentable_units > 0 ? `${item.costs.num_units}U ` : ""}${formatShortMonthly(shownMonthly)}`;
  return el;
}

export function createListingTooltipElement(item: ScoredListing): HTMLElement {
  const shownMonthly =
    item.costs.rentable_units > 0 ? item.costs.net_monthly_cost : item.costs.total_monthly_cost;
  const unitStr = item.listing.unit ? ` #${item.listing.unit}` : "";
  const hood = item.listing.neighborhood || item.listing.borough || "NYC";

  const root = document.createElement("div");
  root.className = "map-tooltip-card";

  const title = document.createElement("div");
  title.className = "map-tooltip-title";
  title.textContent = `${item.listing.address}${unitStr}`;

  const parts = [
    hood,
    `${item.listing.beds}bd/${item.listing.baths}ba`,
    `$${Math.round(shownMonthly).toLocaleString()}/mo`,
  ];
  if (item.costs.dti_pct != null) parts.push(`${item.costs.dti_pct}% DTI`);
  if (item.commute_minutes != null) {
    parts.push(`${item.commute_mode === "walk" ? "🚶" : "🚇"} ${item.commute_minutes}m`);
  }
  parts.push(`Score ${item.score}`);

  const meta = document.createElement("div");
  meta.className = "map-tooltip-meta";
  meta.textContent = parts.join(" • ");

  root.append(title, meta);
  return root;
}

export function createClusterPinElement(
  count: number,
  minMonthly: number,
  accentColor: string,
  compact: boolean
): HTMLElement {
  const el = document.createElement("div");
  el.className = compact ? "map-cluster-bubble" : "map-cluster-pill";
  el.style.borderColor = accentColor;

  if (compact) {
    el.textContent = String(count);
    return el;
  }

  const badge = document.createElement("span");
  badge.className = "map-cluster-count";
  badge.style.backgroundColor = accentColor;
  badge.textContent = String(count);

  const price = document.createElement("span");
  price.textContent = `${formatShortMonthly(minMonthly)}+`;

  el.append(badge, price);
  return el;
}

export function createClusterTooltipElement(
  count: number,
  minMonthly: number,
  topScore: number
): HTMLElement {
  const root = document.createElement("div");
  root.className = "map-tooltip-card";

  const title = document.createElement("div");
  title.className = "map-tooltip-title";
  title.textContent = `${count} listings`;

  const meta = document.createElement("div");
  meta.className = "map-tooltip-meta";
  meta.textContent = `From $${Math.round(minMonthly).toLocaleString()}/mo • Top score ${topScore.toFixed(1)}`;

  const hint = document.createElement("div");
  hint.className = "map-tooltip-hint";
  hint.textContent = "Click to zoom in";

  root.append(title, meta, hint);
  return root;
}

export function createSubwayPopupElement(name: string, routes: string[]): HTMLElement {
  const root = document.createElement("div");
  root.className = "map-tooltip-card";

  const title = document.createElement("div");
  title.className = "map-tooltip-title";
  title.textContent = `🚇 ${name}`;

  const row = document.createElement("div");
  row.className = "map-mta-row";
  for (const r of routes) {
    const c = MTA_COLORS[r] || { bg: "#64748b", fg: "#fff" };
    const badge = document.createElement("span");
    badge.className = r.length > 1 ? "map-mta-badge map-mta-badge-wide" : "map-mta-badge";
    badge.style.backgroundColor = c.bg;
    badge.style.color = c.fg;
    badge.textContent = r;
    row.appendChild(badge);
  }

  root.append(title, row);
  return root;
}
