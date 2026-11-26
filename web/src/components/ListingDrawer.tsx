import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  Heart,
  Link2,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  Scale,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { UI_CONFIG } from "../config";
import type { ScoredListing } from "../types";
import { HoverTip, InfoTip } from "./InfoTip";

interface ListingDrawerProps {
  item: ScoredListing | null;
  onClose: () => void;
  onShowOnMap?: () => void;
  isPinned: boolean;
  onTogglePin: (id: number) => void;
  isSaved: boolean;
  onToggleSave: (id: number) => void;
  isHidden: boolean;
  onToggleHide: (id: number) => void;
  customLists: Record<string, number[]>;
  onToggleInList: (listName: string, id: number) => void;
  onCreateList: (listName: string, initialId?: number) => void;
}

export function ListingDrawer({
  item,
  onClose,
  onShowOnMap,
  isPinned,
  onTogglePin,
  isSaved,
  onToggleSave,
  isHidden,
  onToggleHide,
  customLists,
  onToggleInList,
  onCreateList,
}: ListingDrawerProps) {
  const [width, setWidth] = useState<number>(UI_CONFIG.drawer.defaultWidth);
  const [dragging, setDragging] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [newListName, setNewListName] = useState<string>("");

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.max(
        UI_CONFIG.drawer.minWidth,
        Math.min(Math.round(window.innerWidth * 0.85), window.innerWidth - e.clientX)
      );
      setWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  if (!item) return null;

  const isExpanded = width >= UI_CONFIG.drawer.expandedBreakpoint;
  const { listing: l, costs: c } = item;
  const total = c.total_monthly_cost || 1;
  const piPct = (c.monthly_mortgage_pi / total) * 100;
  const feePct = (c.monthly_hoa_or_maint / total) * 100;
  const taxPct = (c.monthly_tax / total) * 100;
  const insPct = (c.monthly_insurance / total) * 100;
  const feeLabel = l.property_type === "coop" ? "Co-op Maintenance" : "Common Charges";

  return (
    <div
      style={{ width: typeof window !== "undefined" && window.innerWidth < 640 ? "100vw" : `${width}px`, maxWidth: "100vw" }}
      className="fixed inset-y-0 right-0 z-[1000] flex flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
    >
      {/* Left-edge drag handle */}
      <div
        onMouseDown={() => setDragging(true)}
        className={`absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize transition ${
          dragging ? "bg-blue-500/40" : "hover:bg-zinc-600/30"
        }`}
        title="Drag edge to resize panel"
      />

      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-100">
            {l.address} {l.unit ? `#${l.unit}` : ""}
          </h2>
          <p className="text-xs text-zinc-400">
            {l.neighborhood || l.borough} {l.zip_code ? `• ${l.zip_code}` : ""} •{" "}
            <span className="uppercase">{l.property_type}</span> •{" "}
            <span className="font-medium text-zinc-200">
              {l.beds} bd / {l.baths} ba{l.sqft ? ` • ${l.sqft.toLocaleString()} sqft` : ""}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggleSave(item.id)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              isSaved
                ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
            title={isSaved ? "Remove from favorites" : "Favorite listing"}
          >
            <Heart className={`h-3.5 w-3.5 ${isSaved ? "fill-rose-400 text-rose-400" : ""}`} />
            {isSaved ? "Favorited" : "Favorite"}
          </button>
          <button
            onClick={() => onToggleHide(item.id)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              isHidden
                ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
            title={isHidden ? "Unhide listing" : "Hide listing"}
          >
            {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isHidden ? "Hidden" : "Hide"}</span>
          </button>
          {onShowOnMap && item.listing.latitude != null && item.listing.longitude != null && (
            <button
              onClick={onShowOnMap}
              className="flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
              title="Focus this listing on the map"
            >
              <MapPin className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Map</span>
            </button>
          )}
          <button
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("listing", String(item.id));
              navigator.clipboard?.writeText(url.toString()).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Copy direct link"
          >
            {copied ? <Check className="h-4 w-4 text-teal-400" /> : <Link2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() =>
              setWidth(
                isExpanded
                  ? UI_CONFIG.drawer.defaultWidth
                  : Math.min(UI_CONFIG.drawer.expandedTarget, Math.round(window.innerWidth * 0.65))
              )
            }
            className="hidden rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 sm:inline-flex"
            title={isExpanded ? "Compact width" : "Expand panel"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onTogglePin(item.id)}
            className={`hidden items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium sm:flex ${
              isPinned
                ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            {isPinned ? "Pinned" : "Compare"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {l.photo_url && (
          <img
            src={l.photo_url}
            alt={l.address}
            className={`w-full rounded-xl border border-zinc-800 object-cover ${isExpanded ? "h-72" : "h-48"}`}
          />
        )}

        {/* Headline Stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5">
            <div className="text-[11px] text-zinc-400">
              {c.rentable_units > 0 ? "Net Out-of-Pocket" : "All-In Monthly"}
            </div>
            <div className="text-base font-semibold text-zinc-50">
              ${Math.round(c.rentable_units > 0 ? c.net_monthly_cost : c.total_monthly_cost).toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500">
              {c.rentable_units > 0
                ? `$${Math.round(c.total_monthly_cost).toLocaleString()} gross`
                : `~$${Math.round(c.effective_after_tax_monthly).toLocaleString()} after-tax`}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5">
            <div className="text-[11px] text-zinc-400">Asking Price</div>
            <div className="text-base font-semibold text-zinc-50">
              ${Math.round(l.price).toLocaleString()}
            </div>
            <div className="text-[10px] text-zinc-500">
              {item.price_per_sqft ? `$${item.price_per_sqft.toLocaleString()}/sqft` : "Sqft N/A"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5">
            <div className="text-[11px] text-zinc-400">Layout</div>
            <div className="text-base font-semibold text-zinc-50">
              {l.beds}bd / {l.baths}ba
            </div>
            <div className="text-[10px] text-zinc-500">
              {l.sqft ? `${l.sqft.toLocaleString()} sqft` : "Sqft N/A"}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5">
            <div className="flex items-center text-[11px] text-zinc-400">
              Score / DTI
              <InfoTip
                align="right"
                text="Score (0–100): weighted blend of monthly budget headroom (30%), $/sqft value (20%), Midtown commute (15%), size fit (15%), amenities (12%), and price drops (8%). DTI = gross monthly housing ÷ gross monthly income."
              />
            </div>
            <div className="text-base font-semibold text-blue-400">{item.score.toFixed(1)}</div>
            <div className="text-[10px] text-zinc-500">
              {c.dti_pct != null ? `${c.dti_pct}% gross DTI` : "DTI N/A"}
            </div>
          </div>
        </div>

        {/* Custom Lists Membership */}
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <FolderPlus className="h-3.5 w-3.5 text-blue-400" />
            <span>Lists</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(customLists).map(([name, ids]) => {
              const inList = ids.includes(item.id);
              return (
                <button
                  key={name}
                  onClick={() => onToggleInList(name, item.id)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    inList
                      ? "border-blue-500/60 bg-blue-500/15 text-blue-200"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  }`}
                >
                  {inList ? <Check className="h-3 w-3 text-blue-400" /> : <Plus className="h-3 w-3" />}
                  {name}
                </button>
              );
            })}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newListName.trim();
                if (!trimmed) return;
                onCreateList(trimmed, item.id);
                setNewListName("");
              }}
              className="flex items-center gap-1"
            >
              <input
                type="text"
                placeholder="New list..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                className="w-28 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
              {newListName.trim() && (
                <button
                  type="submit"
                  className="rounded-full bg-blue-500 px-2 py-1 text-[10px] font-semibold text-zinc-950 hover:bg-blue-400"
                >
                  Add
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Midtown Commute Card */}
        {item.commute_minutes != null && (
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs">
            <div>
              <div className="font-medium text-zinc-200">
                {item.commute_mode === "walk" ? "🚶 Walk to Midtown" : "🚇 Subway to Midtown"}:{" "}
                <span className="text-zinc-50">~{item.commute_minutes} min</span>
              </div>
              {item.nearest_station && (
                <div className="text-[11px] text-zinc-400">
                  Nearest: {item.nearest_station}
                  {item.walk_to_station_min != null ? ` (${item.walk_to_station_min}m walk)` : ""}
                  {item.nearest_routes.length > 0 ? ` • ${item.nearest_routes.join(" / ")}` : ""}
                </div>
              )}
            </div>
            <span className="rounded-lg bg-zinc-800 px-2 py-1 font-semibold text-zinc-200">
              {item.commute_minutes}m
            </span>
          </div>
        )}

        {/* Stacked Monthly Cost Bar */}
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="text-xs font-medium text-zinc-200">Monthly Cost Breakdown</div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <HoverTip
              text={`Mortgage P&I: $${Math.round(c.monthly_mortgage_pi).toLocaleString()}/mo`}
              style={{ width: `${piPct}%` }}
              className="block h-full"
            >
              <div className="h-full w-full bg-blue-400" />
            </HoverTip>
            <HoverTip
              text={`${feeLabel}: $${Math.round(c.monthly_hoa_or_maint).toLocaleString()}/mo`}
              style={{ width: `${feePct}%` }}
              className="block h-full"
            >
              <div className="h-full w-full bg-indigo-400" />
            </HoverTip>
            {taxPct > 0 && (
              <HoverTip
                text={`Property Tax: $${Math.round(c.monthly_tax).toLocaleString()}/mo`}
                style={{ width: `${taxPct}%` }}
                className="block h-full"
              >
                <div className="h-full w-full bg-teal-400" />
              </HoverTip>
            )}
            <HoverTip
              text={`Insurance: $${Math.round(c.monthly_insurance).toLocaleString()}/mo`}
              style={{ width: `${insPct}%` }}
              className="block h-full"
            >
              <div className="h-full w-full bg-zinc-500" />
            </HoverTip>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-blue-400" /> Mortgage P&amp;I ({c.interest_rate_pct}%, {c.loan_term_years}y)
              </span>
              <span className="font-medium text-zinc-100">${Math.round(c.monthly_mortgage_pi).toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-indigo-400" /> {feeLabel}
              </span>
              <span className="font-medium text-zinc-100">${Math.round(c.monthly_hoa_or_maint).toLocaleString()}/mo</span>
            </div>
            {l.property_type !== "coop" && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-teal-400" /> Monthly Property Tax
                </span>
                <span className="font-medium text-zinc-100">${Math.round(c.monthly_tax).toLocaleString()}/mo</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-zinc-500" /> Building / HO-6 Insurance
              </span>
              <span className="font-medium text-zinc-100">${Math.round(c.monthly_insurance).toLocaleString()}/mo</span>
            </div>
            {c.rentable_units > 0 && (
              <>
                <div className="flex justify-between border-t border-zinc-800 pt-1 text-indigo-300">
                  <span>− Rental Offset ({c.rentable_units} unit{c.rentable_units > 1 ? "s" : ""}, 85% net)</span>
                  <span className="font-semibold">−${Math.round(c.estimated_net_rental_income).toLocaleString()}/mo</span>
                </div>
                <div className="flex justify-between font-semibold text-teal-300">
                  <span>Net Out-of-Pocket ({c.num_units}-Unit)</span>
                  <span>${Math.round(c.net_monthly_cost).toLocaleString()}/mo</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* NYT-Style Buy vs. Rent Comparison */}
        {item.buy_vs_rent && (
          <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center text-xs font-medium text-zinc-200">
                Buy vs. Rent ({item.buy_vs_rent.hold_years}-Yr Horizon)
                <InfoTip
                  align="left"
                  text="Equivalent Monthly Rent is the NYT breakeven number: if you can rent a similar place for less than this amount, renting beats buying over your hold horizon (after opportunity cost, equity, appreciation, and selling costs)."
                />
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  item.buy_vs_rent.verdict === "BUY_WINS"
                    ? "bg-teal-500/15 text-teal-300"
                    : item.buy_vs_rent.verdict === "RENT_WINS"
                    ? "bg-blue-500/15 text-blue-300"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {item.buy_vs_rent.net_advantage_buy >= 0
                  ? `Buy saves +$${Math.round(item.buy_vs_rent.net_advantage_buy / 1000)}k`
                  : `Renting saves +$${Math.round(Math.abs(item.buy_vs_rent.net_advantage_buy) / 1000)}k`}
              </span>
            </div>

            <p className="text-xs leading-relaxed text-zinc-300">
              Buying here is equivalent to renting at{" "}
              <strong className="text-zinc-50">
                ${Math.round(item.buy_vs_rent.equivalent_monthly_rent).toLocaleString()}/mo
              </strong>{" "}
              vs. your current{" "}
              <strong className="text-zinc-50">
                ${Math.round(item.buy_vs_rent.current_monthly_rent).toLocaleString()}/mo
              </strong>
              .{" "}
              <span className="text-zinc-400">
                {item.buy_vs_rent.breakeven_year
                  ? `Breaks even in Year ${item.buy_vs_rent.breakeven_year}.`
                  : "Renting stays ahead through Year 15."}
              </span>
            </p>

            {item.buy_vs_rent.yearly_series.length > 0 && (
              <div className="h-36 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={item.buy_vs_rent.yearly_series}
                    margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-800)" />
                    <XAxis
                      dataKey="year"
                      tickFormatter={(v) => `Y${v}`}
                      stroke="var(--color-zinc-400)"
                      fontSize={10}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                      stroke="var(--color-zinc-400)"
                      fontSize={10}
                    />
                    <ReferenceLine
                      x={item.buy_vs_rent.hold_years}
                      stroke="var(--color-zinc-400)"
                      strokeDasharray="3 3"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-zinc-950)",
                        border: "1px solid var(--color-zinc-700)",
                        borderRadius: 8,
                        fontSize: 11,
                        color: "var(--color-zinc-100)",
                      }}
                      labelStyle={{ color: "var(--color-zinc-50)", fontWeight: 600, marginBottom: 2 }}
                      itemStyle={{ color: "var(--color-zinc-200)" }}
                      labelFormatter={(v) => `Year ${v}`}
                      formatter={(val, name) => [
                        `$${Math.round(Number(val)).toLocaleString()}`,
                        name === "buy_net_cost" ? "Buy Net Cost" : "Rent Net Cost",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="buy_net_cost"
                      stroke="#2dd4bf"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rent_net_cost"
                      stroke="#60a5fa"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-teal-400" /> Buy Net Cost
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-400" /> Rent Net Cost
                </span>
              </div>
              <span>Lower line = better</span>
            </div>
          </div>
        )}

        {/* Upfront Cash to Close */}
        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-xs">
          <div className="flex items-center font-medium text-zinc-200">
            NYC Cash to Close Estimate
            <InfoTip
              align="left"
              text="Includes down payment + NYC Mansion Tax (1%+ at $1M+) + attorney/title fees. Condos & townhouses also pay NYC Mortgage Recording Tax (~1.925% of loan); co-ops are exempt."
            />
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Down Payment ({c.down_payment_pct}%)</span>
            <span className="text-zinc-100">${Math.round(c.down_payment_amount).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-zinc-400">
            <span>Closing Costs {c.mansion_tax > 0 ? `(incl. $${Math.round(c.mansion_tax).toLocaleString()} Mansion Tax)` : ""}</span>
            <span className="text-zinc-100">${Math.round(c.estimated_closing_costs).toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-800 pt-1.5 font-semibold text-zinc-100">
            <span>Total Est. Cash Needed</span>
            <span className="text-zinc-50">${Math.round(c.estimated_cash_to_close).toLocaleString()}</span>
          </div>
        </div>

        {/* Warnings / Rejections */}
        {(c.warnings.length > 0 || item.rejection_reasons.length > 0) && (
          <div className="space-y-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900/80 p-3 text-xs text-zinc-300">
            <div className="flex items-center gap-1.5 font-medium text-amber-300/90">
              <AlertTriangle className="h-3.5 w-3.5" /> Notes &amp; Guardrails
            </div>
            {item.rejection_reasons.map((r, idx) => (
              <div key={`rej-${idx}`}>• Rejected: {r}</div>
            ))}
            {c.warnings.map((w, idx) => (
              <div key={`warn-${idx}`}>• {w}</div>
            ))}
          </div>
        )}

        {/* Score Components */}
        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="text-xs font-medium text-zinc-200">Score Factors</div>
          {Object.entries(item.score_components).map(([key, val]) => (
            <div key={key} className="space-y-0.5 text-[11px]">
              <div className="flex justify-between text-zinc-400">
                <span className="capitalize">{key.replace(/_/g, " ")}</span>
                <span className="text-zinc-200">{val.toFixed(0)}/100</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div style={{ width: `${val}%` }} className="h-full rounded-full bg-blue-400" />
              </div>
            </div>
          ))}
        </div>

        {/* Amenities & Description */}
        {l.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {l.amenities.map((a) => (
              <span
                key={a}
                className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-300"
              >
                {a.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {l.description && (
          <p className="text-xs leading-relaxed text-zinc-400">{l.description}</p>
        )}
      </div>

      {l.url && (
        <div className="border-t border-zinc-800 p-3">
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:opacity-90"
          >
            Open Full Listing <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
