import { useState } from "react";
import { ExternalLink, Maximize2, Scale, X } from "lucide-react";
import type { ScoredListing } from "../types";
import { buildStreetEasyUrl } from "../utils/streeteasy";

interface CompareBarProps {
  items: ScoredListing[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onSelect: (item: ScoredListing) => void;
}

function effectiveMonthly(item: ScoredListing): number {
  return item.costs.rentable_units > 0
    ? item.costs.net_monthly_cost
    : item.costs.total_monthly_cost;
}

export function CompareBar({ items, onRemove, onClear, onSelect }: CompareBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  // Compute row winners (only highlight when comparing >= 2 listings)
  const canHighlight = items.length >= 2;
  const bestMonthly = Math.min(...items.map(effectiveMonthly));
  const bestPrice = Math.min(...items.map((i) => i.listing.price));
  const ppsfs = items.map((i) => i.price_per_sqft).filter((v): v is number => v != null && v > 0);
  const bestPpsf = ppsfs.length ? Math.min(...ppsfs) : null;
  const sqfts = items.map((i) => i.listing.sqft).filter((v): v is number => v != null && v > 0);
  const bestSqft = sqfts.length ? Math.max(...sqfts) : null;
  const commutes = items.map((i) => i.commute_minutes).filter((v): v is number => v != null);
  const bestCommute = commutes.length ? Math.min(...commutes) : null;
  const bestCash = Math.min(...items.map((i) => i.costs.estimated_cash_to_close));
  const bestFees = Math.min(...items.map((i) => i.costs.monthly_hoa_or_maint + i.costs.monthly_tax));
  const bestScore = Math.max(...items.map((i) => i.score));
  const bvrs = items
    .map((i) => i.buy_vs_rent?.net_advantage_buy)
    .filter((v): v is number => v != null);
  const bestBvr = bvrs.length ? Math.max(...bvrs) : null;

  const winCls = (isWinner: boolean) =>
    canHighlight && isWinner ? "text-teal-300 font-semibold" : "text-zinc-200";

  return (
    <>
      {/* Compact Docked Bottom Bar */}
      <div className="border-t border-zinc-800 bg-zinc-950/95 px-4 py-2.5 shadow-2xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-300">
            <Scale className="h-4 w-4" />
            <span>Compare ({items.length}/3)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 transition hover:opacity-90"
            >
              <Maximize2 className="h-3 w-3" /> Expand SxS
            </button>
            <button onClick={onClear} className="text-xs text-zinc-400 hover:text-zinc-200">
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {items.map((item) => {
            const { listing: l, costs: c } = item;
            const mo = effectiveMonthly(item);
            return (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 text-xs hover:border-blue-500/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate font-semibold text-zinc-100">
                    {l.address} {l.unit ? `#${l.unit}` : ""}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.id);
                    }}
                    className="text-zinc-500 hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-zinc-400">
                  <span>
                    Monthly:{" "}
                    <strong className={winCls(mo === bestMonthly)}>
                      ${Math.round(mo).toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Commute:{" "}
                    <strong className={winCls(item.commute_minutes === bestCommute)}>
                      {item.commute_minutes != null ? `${item.commute_minutes}m` : "-"}
                    </strong>
                  </span>
                  <span>
                    Price: <strong className={winCls(l.price === bestPrice)}>${Math.round(l.price / 1000)}k</strong>
                  </span>
                  <span>
                    Cash:{" "}
                    <strong className={winCls(c.estimated_cash_to_close === bestCash)}>
                      ${Math.round(c.estimated_cash_to_close / 1000)}k
                    </strong>
                  </span>
                  <span>
                    Layout: <strong className="text-zinc-200">{l.beds}bd/{l.baths}ba</strong>
                  </span>
                  <span>
                    Score: <strong className={winCls(item.score === bestScore)}>{item.score}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full Side-by-Side Comparison Modal */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Scale className="h-4 w-4 text-blue-400" />
                <span>Side-by-Side Comparison</span>
                <span className="rounded bg-zinc-900 px-2 py-0.5 text-[11px] font-normal text-zinc-400">
                  Best value per row highlighted in teal
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onClear();
                    setExpanded(false);
                  }}
                  className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 align-top">
                    <th className="w-40 pb-4 pr-3 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Property
                    </th>
                    {items.map((item) => {
                      const l = item.listing;
                      return (
                        <th key={item.id} className="min-w-[200px] pb-4 px-2 font-normal">
                          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5">
                            {l.photo_url && (
                              <img
                                src={l.photo_url}
                                alt={l.address}
                                className="h-28 w-full rounded-lg object-cover"
                              />
                            )}
                            <div className="flex items-start justify-between gap-2">
                              <button
                                onClick={() => {
                                  setExpanded(false);
                                  onSelect(item);
                                }}
                                className="text-left hover:underline"
                              >
                                <div className="font-semibold text-zinc-100">
                                  {l.address} {l.unit ? `#${l.unit}` : ""}
                                </div>
                                <div className="text-[11px] text-zinc-400">
                                  {l.neighborhood || l.borough} •{" "}
                                  <span className="uppercase">{l.property_type}</span>
                                </div>
                              </button>
                              <button
                                onClick={() => onRemove(item.id)}
                                className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                                title="Remove"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              {l.url && (
                                <a
                                  href={l.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                                >
                                  {l.url.includes("realtor.com") ? "Realtor.com" : "View listing"}{" "}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {!l.url.includes("streeteasy.com") && (
                                <a
                                  href={buildStreetEasyUrl(l)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-teal-300 hover:text-teal-200"
                                >
                                  StreetEasy <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-800/80">
                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Composite Score</td>
                    {items.map((item) => (
                      <td key={item.id} className={`px-3 py-2.5 ${winCls(item.score === bestScore)}`}>
                        {item.score.toFixed(1)} / 100
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">All-In / Net Monthly</td>
                    {items.map((item) => {
                      const mo = effectiveMonthly(item);
                      return (
                        <td key={item.id} className={`px-3 py-2.5 ${winCls(mo === bestMonthly)}`}>
                          ${Math.round(mo).toLocaleString()}/mo
                          {item.costs.rentable_units > 0 && (
                            <span className="ml-1 text-[10px] text-indigo-300">
                              ({item.costs.num_units}U net)
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Asking Price</td>
                    {items.map((item) => (
                      <td key={item.id} className={`px-3 py-2.5 ${winCls(item.listing.price === bestPrice)}`}>
                        ${Math.round(item.listing.price).toLocaleString()}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Layout &amp; Size</td>
                    {items.map((item) => (
                      <td
                        key={item.id}
                        className={`px-3 py-2.5 ${winCls(bestSqft != null && item.listing.sqft === bestSqft)}`}
                      >
                        {item.listing.beds} bd / {item.listing.baths} ba
                        {item.listing.sqft ? ` • ${item.listing.sqft.toLocaleString()} sqft` : ""}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Price / Sqft</td>
                    {items.map((item) => (
                      <td
                        key={item.id}
                        className={`px-3 py-2.5 ${winCls(bestPpsf != null && item.price_per_sqft === bestPpsf)}`}
                      >
                        {item.price_per_sqft ? `$${item.price_per_sqft.toLocaleString()}/sqft` : "—"}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Mortgage P&amp;I</td>
                    {items.map((item) => (
                      <td key={item.id} className="px-3 py-2.5 text-zinc-300">
                        ${Math.round(item.costs.monthly_mortgage_pi).toLocaleString()}/mo
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Monthly Fees + Tax</td>
                    {items.map((item) => {
                      const ft = item.costs.monthly_hoa_or_maint + item.costs.monthly_tax;
                      return (
                        <td key={item.id} className={`px-3 py-2.5 ${winCls(ft === bestFees)}`}>
                          ${Math.round(ft).toLocaleString()}/mo
                          <span className="ml-1 text-[10px] text-zinc-500">
                            ({Math.round(item.costs.monthly_fees_ratio * 100)}%)
                          </span>
                        </td>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Housing DTI</td>
                    {items.map((item) => (
                      <td key={item.id} className="px-3 py-2.5 text-zinc-300">
                        {item.costs.dti_pct != null ? `${item.costs.dti_pct}%` : "—"}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Cash to Close</td>
                    {items.map((item) => (
                      <td
                        key={item.id}
                        className={`px-3 py-2.5 ${winCls(item.costs.estimated_cash_to_close === bestCash)}`}
                      >
                        ${Math.round(item.costs.estimated_cash_to_close).toLocaleString()}
                        <div className="text-[10px] text-zinc-500">
                          incl. ${Math.round(item.costs.estimated_closing_costs).toLocaleString()} closing
                        </div>
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Midtown Commute</td>
                    {items.map((item) => (
                      <td
                        key={item.id}
                        className={`px-3 py-2.5 ${winCls(bestCommute != null && item.commute_minutes === bestCommute)}`}
                      >
                        {item.commute_minutes != null ? (
                          <>
                            {item.commute_mode === "walk" ? "🚶" : "🚇"} {item.commute_minutes} min
                            {item.nearest_station && (
                              <div className="text-[10px] text-zinc-500">
                                {item.nearest_station} ({item.walk_to_station_min}m walk)
                              </div>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">NYT Buy vs. Rent</td>
                    {items.map((item) => {
                      const bvr = item.buy_vs_rent;
                      if (!bvr) return <td key={item.id} className="px-3 py-2.5 text-zinc-500">—</td>;
                      return (
                        <td
                          key={item.id}
                          className={`px-3 py-2.5 ${winCls(bestBvr != null && bvr.net_advantage_buy === bestBvr)}`}
                        >
                          <div>
                            {bvr.net_advantage_buy >= 0
                              ? `Buy +$${Math.round(bvr.net_advantage_buy / 1000)}k`
                              : `Rent +$${Math.round(Math.abs(bvr.net_advantage_buy) / 1000)}k`}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            Eq. ${Math.round(bvr.equivalent_monthly_rent).toLocaleString()}/mo
                            {bvr.breakeven_year ? ` • BE Yr ${bvr.breakeven_year}` : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  <tr>
                    <td className="py-2.5 pr-3 text-zinc-400">Amenities</td>
                    {items.map((item) => (
                      <td key={item.id} className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {item.listing.amenities.length > 0 ? (
                            item.listing.amenities.map((a) => (
                              <span
                                key={a}
                                className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300"
                              >
                                {a.replace(/_/g, " ")}
                              </span>
                            ))
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
