import type { ScoredListing } from "../types";

export const MTA_COLORS: Record<string, { bg: string; fg: string }> = {
  A: { bg: "#2850AD", fg: "#fff" },
  C: { bg: "#2850AD", fg: "#fff" },
  E: { bg: "#2850AD", fg: "#fff" },
  B: { bg: "#FF6319", fg: "#fff" },
  D: { bg: "#FF6319", fg: "#fff" },
  F: { bg: "#FF6319", fg: "#fff" },
  M: { bg: "#FF6319", fg: "#fff" },
  G: { bg: "#6CBE45", fg: "#fff" },
  J: { bg: "#996633", fg: "#fff" },
  Z: { bg: "#996633", fg: "#fff" },
  L: { bg: "#A7A9AC", fg: "#0f172a" },
  N: { bg: "#FCCC0A", fg: "#0f172a" },
  Q: { bg: "#FCCC0A", fg: "#0f172a" },
  R: { bg: "#FCCC0A", fg: "#0f172a" },
  W: { bg: "#FCCC0A", fg: "#0f172a" },
  "1": { bg: "#EE352E", fg: "#fff" },
  "2": { bg: "#EE352E", fg: "#fff" },
  "3": { bg: "#EE352E", fg: "#fff" },
  "4": { bg: "#00933C", fg: "#fff" },
  "5": { bg: "#00933C", fg: "#fff" },
  "6": { bg: "#00933C", fg: "#fff" },
  "7": { bg: "#B933AD", fg: "#fff" },
  S: { bg: "#808183", fg: "#fff" },
  PATH: { bg: "#0078C8", fg: "#fff" },
};

export function formatShortMonthly(val: number): string {
  return `$${(val / 1000).toFixed(1)}k`;
}

export function pinColors(item: ScoredListing, isSelected: boolean): { bg: string; fg: string } {
  if (isSelected) return { bg: "#fafafa", fg: "#09090b" };
  if (!item.passes_filters) return { bg: "#3f3f46", fg: "#d4d4d8" };
  if (item.score >= 65) return { bg: "#2dd4bf", fg: "#09090b" };
  if (item.score >= 50) return { bg: "#60a5fa", fg: "#09090b" };
  return { bg: "#a1a1aa", fg: "#09090b" };
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
