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

export function createListingPinElement(
  item: ScoredListing,
  isSelected: boolean,
  markerTag: "" | "♥" | "★" = ""
): HTMLElement {
  const pin = pinColors(item, isSelected);
  const shownMonthly =
    item.costs.rentable_units > 0 ? item.costs.net_monthly_cost : item.costs.total_monthly_cost;

  const el = document.createElement("div");
  el.className = isSelected ? "map-price-pin map-price-pin-selected" : "map-price-pin";
  el.style.backgroundColor = pin.bg;
  el.style.color = pin.fg;
  const tagPrefix = markerTag ? `${markerTag} ` : "";
  const unitPrefix = item.costs.rentable_units > 0 ? `${item.costs.num_units}U ` : "";
  el.textContent = `${tagPrefix}${unitPrefix}${formatShortMonthly(shownMonthly)}`;
  return el;
}

export function createListingTooltipElement(
  item: ScoredListing,
  listNames: string[] = []
): HTMLElement {
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

  if (listNames.length > 0) {
    const listsEl = document.createElement("div");
    listsEl.className = "map-tooltip-hint";
    listsEl.textContent = `★ In: ${listNames.join(", ")}`;
    root.appendChild(listsEl);
  }
  return root;
}

export function createClusterPinElement(
  count: number,
  minMonthly: number,
  accentColor: string,
  compact: boolean,
  isSelected = false
): HTMLElement {
  const el = document.createElement("div");
  el.className = compact
    ? "map-cluster-bubble"
    : isSelected
    ? "map-cluster-pill map-price-pin-selected"
    : "map-cluster-pill";
  el.style.borderColor = isSelected ? "#3b82f6" : accentColor;

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

export function createBuildingUnitsPopupElement(
  items: ScoredListing[],
  selectedId: number | null,
  onSelect: (item: ScoredListing) => void,
  listsById: Map<number, string[]> = new Map()
): HTMLElement {
  const root = document.createElement("div");
  root.className = "map-building-popup";

  const header = document.createElement("div");
  header.className = "map-building-popup-header";

  const title = document.createElement("div");
  title.className = "map-tooltip-title";
  title.textContent = items[0]?.listing.address || "Building";

  const count = document.createElement("div");
  count.className = "map-building-popup-sub";
  count.textContent = `${items.length} units in building`;

  header.append(title, count);

  const list = document.createElement("div");
  list.className = "map-building-unit-list";

  for (const item of items) {
    const shownMonthly =
      item.costs.rentable_units > 0 ? item.costs.net_monthly_cost : item.costs.total_monthly_cost;
    const itemLists = listsById.get(item.id) || [];

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      item.id === selectedId
        ? "map-building-unit-row map-building-unit-row-selected"
        : "map-building-unit-row";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(item);
    });

    const left = document.createElement("div");
    left.className = "map-building-unit-left";

    const unitLabel = document.createElement("div");
    unitLabel.className = "map-building-unit-name";
    const listTag = itemLists.length > 0 ? (itemLists.includes("Favorites") ? "♥ " : "★ ") : "";
    unitLabel.textContent = `${listTag}${item.listing.unit ? `#${item.listing.unit}` : "Unit"}`;

    const meta = document.createElement("div");
    meta.className = "map-building-unit-meta";
    meta.textContent = `${item.listing.beds}bd/${item.listing.baths}ba${
      item.listing.sqft ? ` • ${item.listing.sqft.toLocaleString()}sf` : ""
    } • Score ${item.score.toFixed(1)}`;

    left.append(unitLabel, meta);

    const price = document.createElement("div");
    price.className = "map-building-unit-price";
    price.textContent = `$${Math.round(shownMonthly).toLocaleString()}/mo`;

    btn.append(left, price);
    list.appendChild(btn);
  }

  root.append(header, list);
  return root;
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
