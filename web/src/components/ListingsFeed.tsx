import { useEffect, useRef } from "react";
import { Bookmark, Eye, EyeOff, Heart, Scale } from "lucide-react";
import type { ScoredListing } from "../types";
import { HoverTip } from "./InfoTip";
import { SearchAutocomplete } from "./SearchAutocomplete";

interface ListingsFeedProps {
  listings: ScoredListing[];
  allListings: ScoredListing[];
  loading: boolean;
  isDesktop: boolean;
  rightPanelWidth: number;
  selectedId: number | null;
  savedIds: number[];
  hiddenIds: number[];
  customLists?: Record<string, number[]>;
  pinnedIds: number[];
  useNetRental: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectListing: (item: ScoredListing) => void;
  onSelectNeighborhood: (hood: string) => void;
  onToggleSave: (id: number) => void;
  onToggleHide: (id: number) => void;
  onTogglePin: (id: number) => void;
}

export function ListingsFeed({
  listings,
  allListings,
  loading,
  isDesktop,
  rightPanelWidth,
  selectedId,
  savedIds,
  hiddenIds,
  customLists = {},
  pinnedIds,
  useNetRental,
  searchQuery,
  onSearchChange,
  onSelectListing,
  onSelectNeighborhood,
  onToggleSave,
  onToggleHide,
  onTogglePin,
}: ListingsFeedProps) {
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (selectedId == null) return;
    const el = cardRefs.current.get(selectedId);
    el?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  return (
    <div
      style={isDesktop ? { width: `${rightPanelWidth}px` } : undefined}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 lg:flex-none lg:shrink-0"
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span>{loading ? "Updating..." : `${listings.length} listings ranked`}</span>
        <span className="text-[11px] text-zinc-500">Tap card to inspect</span>
      </div>

      {!isDesktop && (
        <div className="border-b border-zinc-800 p-2">
          <SearchAutocomplete
            query={searchQuery}
            onQueryChange={onSearchChange}
            listings={allListings}
            onSelectListing={onSelectListing}
            onSelectNeighborhood={onSelectNeighborhood}
          />
        </div>
      )}

      <div className="flex-1 divide-y divide-zinc-800/80 overflow-y-auto">
        {listings.map((item) => {
          const { listing: l, costs: c } = item;
          const active = item.id === selectedId;
          const pinned = pinnedIds.includes(item.id);
          const saved = savedIds.includes(item.id);
          const hidden = hiddenIds.includes(item.id);
          const memberLists = Object.entries(customLists)
            .filter(([, ids]) => ids.includes(item.id))
            .map(([name]) => name);
          const shownMo =
            c.rentable_units > 0 && useNetRental ? c.net_monthly_cost : c.total_monthly_cost;

          return (
            <div
              key={item.id}
              ref={(node) => {
                if (node) cardRefs.current.set(item.id, node);
                else cardRefs.current.delete(item.id);
              }}
              onClick={() => onSelectListing(item)}
              className={`cursor-pointer p-3 transition ${
                active
                  ? "border-l-2 border-l-blue-400 bg-blue-500/10 ring-1 ring-inset ring-blue-500/35"
                  : "hover:bg-zinc-900/80"
              } ${!item.passes_filters ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-zinc-100">
                      {l.address} {l.unit ? `#${l.unit}` : ""}
                    </span>
                    {memberLists.length > 0 && (
                      <HoverTip text={`In lists: ${memberLists.join(", ")}`}>
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                          <Bookmark className="h-2.5 w-2.5 fill-blue-400 text-blue-400" />
                          {memberLists.length === 1 ? memberLists[0] : `${memberLists.length} lists`}
                        </span>
                      </HoverTip>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {l.neighborhood || l.borough} •{" "}
                    <span className="uppercase">{l.property_type}</span> • {l.beds}bd/{l.baths}ba
                    {l.sqft ? ` • ${l.sqft.toLocaleString()} sqft` : ""}
                    {l.year_built ? ` • ${l.year_built}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-zinc-50">
                    ${Math.round(shownMo).toLocaleString()}
                    <span className="text-[10px] font-normal text-zinc-400">
                      {c.rentable_units > 0 && useNetRental ? "/mo net" : "/mo"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    ${Math.round(l.price).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <HoverTip text="Composite score (0–100): budget headroom, $/sqft, Midtown commute, size, amenities & price drops">
                    <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-medium text-blue-300">
                      {item.score.toFixed(1)}
                    </span>
                  </HoverTip>
                  {item.commute_minutes != null && (
                    <HoverTip
                      text={`Est. ${item.commute_minutes} min door-to-door to Midtown${item.nearest_station ? ` via ${item.nearest_station} (${item.walk_to_station_min}m walk)` : ""}`}
                    >
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                        {item.commute_mode === "walk" ? "🚶" : "🚇"} {item.commute_minutes}m
                      </span>
                    </HoverTip>
                  )}
                  {c.rentable_units > 0 && (
                    <HoverTip
                      text={`${c.num_units}-unit building: subtracting 85% net rent from ${c.rentable_units} extra unit(s)`}
                    >
                      <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-medium text-indigo-300">
                        {c.num_units}U (−${Math.round((c.estimated_net_rental_income / 1000) * 10) / 10}k)
                      </span>
                    </HoverTip>
                  )}
                  {c.dti_pct != null && (
                    <HoverTip text="Front-end Debt-to-Income (monthly housing ÷ gross monthly salary). NYC co-ops usually require ≤28%.">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          c.dti_pct <= 28
                            ? "bg-teal-500/12 text-teal-300"
                            : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {c.dti_pct}% DTI
                      </span>
                    </HoverTip>
                  )}
                  {item.buy_vs_rent && (
                    <HoverTip
                      text={`NYT equivalent rent: $${Math.round(item.buy_vs_rent.equivalent_monthly_rent).toLocaleString()}/mo over ${item.buy_vs_rent.hold_years}y`}
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          item.buy_vs_rent.verdict === "BUY_WINS"
                            ? "bg-teal-500/12 text-teal-300"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {item.buy_vs_rent.verdict === "BUY_WINS"
                          ? "Buy ✓"
                          : `Eq $${(item.buy_vs_rent.equivalent_monthly_rent / 1000).toFixed(1)}k`}
                      </span>
                    </HoverTip>
                  )}
                  <HoverTip text="Monthly HOA / Co-op maintenance plus property tax (already bundled for co-ops).">
                    <span className="text-zinc-500">
                      Fees ${Math.round(c.monthly_hoa_or_maint + c.monthly_tax).toLocaleString()}
                    </span>
                  </HoverTip>
                  {l.days_on_market != null && l.days_on_market >= 0 && (
                    <HoverTip
                      text={`${l.days_on_market} day${l.days_on_market === 1 ? "" : "s"} on market. Listings sitting 60+ days often have more room to negotiate.`}
                    >
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          l.days_on_market >= 60
                            ? "bg-amber-500/12 text-amber-300"
                            : "bg-zinc-800/80 text-zinc-400"
                        }`}
                      >
                        {l.days_on_market}d
                      </span>
                    </HoverTip>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <HoverTip text={saved ? "Remove from favorites" : "Favorite listing"}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSave(item.id);
                      }}
                      className={`rounded p-1 ${
                        saved ? "text-rose-400" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${saved ? "fill-rose-400" : ""}`} />
                    </button>
                  </HoverTip>
                  <HoverTip text={pinned ? "Unpin from compare" : "Pin to side-by-side compare"}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(item.id);
                      }}
                      className={`rounded p-1 ${
                        pinned ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <Scale className="h-3.5 w-3.5" />
                    </button>
                  </HoverTip>
                  <HoverTip text={hidden ? "Unhide listing" : "Hide listing"}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleHide(item.id);
                      }}
                      className={`rounded p-1 ${
                        hidden ? "text-amber-300" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                      aria-label={hidden ? "Unhide listing" : "Hide listing"}
                    >
                      {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  </HoverTip>
                </div>
              </div>
            </div>
          );
        })}
        {listings.length === 0 && !loading && (
          <div className="p-8 text-center text-xs text-zinc-500">
            No listings match the current knobs. Try raising Max Monthly Cost or toggling "Show Rejected".
          </div>
        )}
      </div>
    </div>
  );
}
