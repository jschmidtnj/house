import { useState } from "react";
import { EyeOff, Folder, Heart, Plus, RotateCcw, Sliders, Trash2, X } from "lucide-react";
import { PROPERTY_TYPES } from "../config";
import type { KnobsState } from "../types";
import { InfoTip } from "./InfoTip";

interface KnobSidebarProps {
  knobs: KnobsState;
  onChange: (next: KnobsState) => void;
  onReset: () => void;
  width: number;
  isMobile?: boolean;
  onClose?: () => void;
  savedCount: number;
  hiddenCount: number;
  customLists: Record<string, number[]>;
  activeList: string | null; // null = All, "__favorites__" = Favorites, "__hidden__" = Hidden, else custom list name
  onSelectList: (name: string | null) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (name: string) => void;
  availableBoroughs: { name: string; count: number }[];
  selectedBoroughs: string[];
  onToggleBorough: (name: string) => void;
  availableNeighborhoods: { name: string; count: number }[];
  selectedNeighborhoods: string[];
  onToggleNeighborhood: (name: string) => void;
  onClearLocations: () => void;
}

const ALL_TYPES: readonly string[] = PROPERTY_TYPES;

export function KnobSidebar({
  knobs,
  onChange,
  onReset,
  width,
  isMobile = false,
  onClose,
  savedCount,
  hiddenCount,
  customLists,
  activeList,
  onSelectList,
  onCreateList,
  onDeleteList,
  availableBoroughs,
  selectedBoroughs,
  onToggleBorough,
  availableNeighborhoods,
  selectedNeighborhoods,
  onToggleNeighborhood,
  onClearLocations,
}: KnobSidebarProps) {
  const [newListName, setNewListName] = useState("");
  const [hoodSearch, setHoodSearch] = useState("");
  const grossMonthlyIncome = knobs.annual_income > 0 ? knobs.annual_income / 12 : 0;
  const targetDti = grossMonthlyIncome > 0 ? (knobs.max_monthly_cost / grossMonthlyIncome) * 100 : 0;

  const set = <K extends keyof KnobsState>(key: K, value: KnobsState[K]) => {
    onChange({ ...knobs, [key]: value });
  };

  const toggleType = (ptype: string) => {
    const exists = knobs.property_types.includes(ptype);
    const next = exists
      ? knobs.property_types.filter((t) => t !== ptype)
      : [...knobs.property_types, ptype];
    set("property_types", next.length ? next : [ptype]);
  };

  return (
    <aside
      style={isMobile ? undefined : { width: `${width}px` }}
      className={`flex h-full shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800/90 bg-zinc-950 p-4 ${
        isMobile ? "w-[85vw] max-w-sm shadow-2xl" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Sliders className="h-3.5 w-3.5 text-blue-400" />
          <span>Budget &amp; Filters</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            title="Reset to config/budget.yaml defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          {isMobile && onClose && (
            <button
              onClick={onClose}
              className="rounded-md border border-zinc-800 p-1 text-zinc-400 hover:text-zinc-100"
              aria-label="Close filters"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Lists & Collections */}
      <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          <span>My Lists</span>
        </div>
        <div className="space-y-1 text-xs">
          <button
            onClick={() => onSelectList(null)}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition ${
              activeList === null
                ? "bg-zinc-800 font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <span>All Matching</span>
          </button>
          <button
            onClick={() => onSelectList(activeList === "__favorites__" ? null : "__favorites__")}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition ${
              activeList === "__favorites__"
                ? "bg-rose-500/15 font-medium text-rose-200"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Heart className={`h-3.5 w-3.5 ${activeList === "__favorites__" ? "fill-rose-400 text-rose-400" : ""}`} />
              Favorites
            </span>
            <span className="text-[11px] text-zinc-500">{savedCount}</span>
          </button>

          <button
            onClick={() => onSelectList(activeList === "__hidden__" ? null : "__hidden__")}
            className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition ${
              activeList === "__hidden__"
                ? "bg-zinc-800 font-medium text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5" />
              Hidden
            </span>
            <span className="text-[11px] text-zinc-500">{hiddenCount}</span>
          </button>

          {Object.entries(customLists).map(([name, ids]) => {
            const active = activeList === name;
            return (
              <div
                key={name}
                className={`group flex items-center justify-between rounded-lg px-2 py-1.5 transition ${
                  active
                    ? "bg-blue-500/15 font-medium text-blue-200"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <button
                  onClick={() => onSelectList(active ? null : name)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <span className="truncate">{name}</span>
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500">{ids.length}</span>
                  <button
                    onClick={() => onDeleteList(name)}
                    className="opacity-60 hover:text-rose-400 hover:opacity-100"
                    title={`Delete "${name}"`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newListName.trim();
            if (!trimmed) return;
            onCreateList(trimmed);
            setNewListName("");
          }}
          className="flex items-center gap-1.5 pt-1"
        >
          <input
            type="text"
            placeholder="Create custom list..."
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            title="Create list"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>

      {/* Primary Knob: Max Monthly Cost */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5">
        <div className="flex items-baseline justify-between">
          <label className="flex items-center text-xs font-medium text-zinc-300">
            Max Monthly Cost
            <InfoTip
              align="left"
              text="All-in monthly housing cost: Mortgage P&I + Maintenance/HOA + Property Tax + Insurance (minus 85% net rent for 2–3 unit townhouses). DTI = Monthly Cost ÷ Gross Monthly Salary; NYC co-op boards usually cap DTI at ≤28%."
            />
          </label>
          <span className="text-base font-semibold text-zinc-50">
            ${knobs.max_monthly_cost.toLocaleString()}/mo
          </span>
        </div>
        <input
          type="range"
          min={3000}
          max={14000}
          step={250}
          value={knobs.max_monthly_cost}
          onChange={(e) => set("max_monthly_cost", Number(e.target.value))}
          className="mt-2.5 w-full accent-blue-400"
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
          <span>$3k</span>
          <span className={targetDti > 28 ? "text-zinc-300" : "text-teal-400"}>
            {targetDti.toFixed(1)}% DTI {targetDti <= 28 ? "• Co-op OK" : "• Condo stretch"}
          </span>
          <span>$14k</span>
        </div>
      </div>

      {/* Max Asking Price */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Max Asking Price</span>
          <span className="font-medium text-zinc-100">
            ${(knobs.max_price / 1_000_000).toFixed(2)}M
          </span>
        </div>
        <input
          type="range"
          min={500000}
          max={2500000}
          step={50000}
          value={knobs.max_price}
          onChange={(e) => set("max_price", Number(e.target.value))}
          className="w-full accent-blue-400"
        />
      </div>

      {/* Annual Salary */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Annual Salary (DTI)</span>
          <span className="font-medium text-zinc-100">
            ${Math.round(knobs.annual_income / 1000)}k/yr
          </span>
        </div>
        <input
          type="range"
          min={150000}
          max={600000}
          step={10000}
          value={knobs.annual_income}
          onChange={(e) => set("annual_income", Number(e.target.value))}
          className="w-full accent-blue-400"
        />
      </div>

      {/* Down Payment & Interest Rate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Down</span>
            <span className="font-medium text-zinc-100">{knobs.down_payment_pct}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={50}
            step={5}
            value={knobs.down_payment_pct}
            onChange={(e) => set("down_payment_pct", Number(e.target.value))}
            className="w-full accent-blue-400"
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Rate</span>
            <span className="font-medium text-zinc-100">{knobs.interest_rate_pct.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min={4.5}
            max={8.5}
            step={0.125}
            value={knobs.interest_rate_pct}
            onChange={(e) => set("interest_rate_pct", Number(e.target.value))}
            className="w-full accent-blue-400"
          />
        </div>
      </div>

      {/* Min Beds & Sqft */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400">Min Beds</label>
          <select
            value={knobs.min_beds}
            onChange={(e) => set("min_beds", Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            <option value={0}>Studio+</option>
            <option value={1}>1+ Bed</option>
            <option value={2}>2+ Beds</option>
            <option value={3}>3+ Beds</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400">Min Sqft</label>
          <input
            type="number"
            min={0}
            step={100}
            value={knobs.min_sqft}
            onChange={(e) => set("min_sqft", Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Max Commute to Midtown */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="flex items-center text-zinc-400">
            Max Commute (Midtown)
            <InfoTip
              align="left"
              text="Estimated door-to-door time to Midtown Core (Bryant Park / Grand Central): compares direct walk vs. walking to the best nearby MTA/PATH station + wait + subway ride (+6m if transfer needed)."
            />
          </span>
          <span className="font-medium text-zinc-100">
            {knobs.max_commute_minutes > 0 ? `≤ ${knobs.max_commute_minutes} min` : "Any"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={55}
          step={5}
          value={knobs.max_commute_minutes}
          onChange={(e) => set("max_commute_minutes", Number(e.target.value))}
          className="w-full accent-blue-400"
        />
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>Any</span>
          <span>15m</span>
          <span>30m</span>
          <span>45m+</span>
        </div>
      </div>

      {/* Max Walk to PATH (Jersey City / Hoboken) */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="flex items-center text-zinc-400">
            NJ Walk to PATH
            <InfoTip
              align="left"
              text="For Jersey City & Hoboken listings only: filters out places farther than this walking time from the nearest PATH station (Hoboken, Newport, Grove St, Exchange Pl, or Journal Sq)."
            />
          </span>
          <span className="font-medium text-zinc-100">
            {knobs.nj_max_walk_to_path_min > 0 ? `≤ ${knobs.nj_max_walk_to_path_min} min` : "Any"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={25}
          step={1}
          value={knobs.nj_max_walk_to_path_min}
          onChange={(e) => set("nj_max_walk_to_path_min", Number(e.target.value))}
          className="w-full accent-blue-400"
        />
        <div className="flex justify-between text-[10px] text-zinc-500">
          <span>Any</span>
          <span>10m</span>
          <span>15m</span>
          <span>25m</span>
        </div>
      </div>

      {/* Borough & Neighborhood Filter */}
      {(availableBoroughs.length > 0 || availableNeighborhoods.length > 0) && (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
            <span>Areas &amp; Neighborhoods</span>
            {(selectedBoroughs.length > 0 || selectedNeighborhoods.length > 0) && (
              <button
                onClick={onClearLocations}
                className="text-[11px] text-blue-400 hover:text-blue-300"
              >
                Clear ({selectedBoroughs.length + selectedNeighborhoods.length})
              </button>
            )}
          </div>

          {availableBoroughs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {availableBoroughs.map((b) => {
                const active = selectedBoroughs.includes(b.name);
                return (
                  <button
                    key={b.name}
                    onClick={() => onToggleBorough(b.name)}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                      active
                        ? "border-blue-500/60 bg-blue-500/15 text-blue-200"
                        : "border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    {b.name} <span className="text-[10px] opacity-60">{b.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {availableNeighborhoods.length > 0 && (
            <>
              <input
                type="text"
                placeholder="Search neighborhoods..."
                value={hoodSearch}
                onChange={(e) => setHoodSearch(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
              <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto pr-0.5">
                {availableNeighborhoods
                  .filter(
                    (h) =>
                      !hoodSearch.trim() ||
                      h.name.toLowerCase().includes(hoodSearch.trim().toLowerCase())
                  )
                  .map((h) => {
                    const active = selectedNeighborhoods.includes(h.name);
                    return (
                      <button
                        key={h.name}
                        onClick={() => onToggleNeighborhood(h.name)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                          active
                            ? "border-blue-500/60 bg-blue-500/20 text-blue-200"
                            : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {h.name} <span className="opacity-60">{h.count}</span>
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Property Types */}
      <div className="space-y-1.5">
        <span className="text-xs text-zinc-400">Property Types</span>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TYPES.map((ptype) => {
            const active = knobs.property_types.includes(ptype);
            return (
              <button
                key={ptype}
                onClick={() => toggleType(ptype)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition ${
                  active
                    ? "border-blue-500/50 bg-blue-500/12 text-blue-300"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {ptype}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-3 Unit Townhouse House-Hacking Controls */}
      <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
          <span className="flex items-center">
            2–3 Unit Rental Offset
            <InfoTip
              align="left"
              text="Models house hacking a 2–3 family townhouse: live in 1 unit and rent out the other (N − 1) units. Applies an 85% net factor to cover vacancy and landlord repairs."
            />
          </span>
          <button
            onClick={() =>
              onChange({
                ...knobs,
                min_units: knobs.min_units >= 2 ? 1 : 2,
                property_types:
                  knobs.min_units >= 2
                    ? ["condo", "coop", "condop", "townhouse", "multifamily"]
                    : ["townhouse", "multifamily"],
              })
            }
            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
              knobs.min_units >= 2
                ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {knobs.min_units >= 2 ? "Multi-Unit Only" : "Filter 2–3U"}
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Est. Rent / Extra Unit</span>
            <span className="font-medium text-zinc-100">
              ${knobs.est_rent_per_unit.toLocaleString()}/mo
            </span>
          </div>
          <input
            type="range"
            min={1500}
            max={6000}
            step={100}
            value={knobs.est_rent_per_unit}
            onChange={(e) => set("est_rent_per_unit", Number(e.target.value))}
            className="w-full accent-blue-400"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between text-[11px] text-zinc-400">
          <span>Subtract 85% net rent</span>
          <input
            type="checkbox"
            checked={knobs.use_net_rental_for_filter}
            onChange={(e) => set("use_net_rental_for_filter", e.target.checked)}
            className="accent-blue-400"
          />
        </label>
      </div>

      {/* NYT-Style Buy vs. Rent Assumptions */}
      <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
        <div className="flex items-center text-xs font-medium text-zinc-200">
          Buy vs. Rent Benchmark
          <InfoTip
            align="left"
            text="NYT-style net wealth comparison: pits total ownership cost (down payment opportunity cost, mortgage amortization, taxes, fees, appreciation, 6.5% NYC selling costs) against renting and investing the difference."
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Current Rent</span>
            <span className="font-medium text-zinc-100">
              ${knobs.current_monthly_rent.toLocaleString()}/mo
            </span>
          </div>
          <input
            type="range"
            min={2500}
            max={10000}
            step={100}
            value={knobs.current_monthly_rent}
            onChange={(e) => set("current_monthly_rent", Number(e.target.value))}
            className="w-full accent-blue-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Hold</span>
              <span className="font-medium text-zinc-100">{knobs.hold_years} yrs</span>
            </div>
            <input
              type="range"
              min={3}
              max={15}
              step={1}
              value={knobs.hold_years}
              onChange={(e) => set("hold_years", Number(e.target.value))}
              className="w-full accent-blue-400"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Home +%/yr</span>
              <span className="font-medium text-zinc-100">{knobs.home_appreciation_pct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={6}
              step={0.5}
              value={knobs.home_appreciation_pct}
              onChange={(e) => set("home_appreciation_pct", Number(e.target.value))}
              className="w-full accent-blue-400"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Rent +%/yr</span>
              <span className="font-medium text-zinc-100">{knobs.rent_growth_pct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={knobs.rent_growth_pct}
              onChange={(e) => set("rent_growth_pct", Number(e.target.value))}
              className="w-full accent-blue-400"
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">Market %</span>
              <span className="font-medium text-zinc-100">{knobs.investment_return_pct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min={3}
              max={11}
              step={0.5}
              value={knobs.investment_return_pct}
              onChange={(e) => set("investment_return_pct", Number(e.target.value))}
              className="w-full accent-blue-400"
            />
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-2 border-t border-zinc-800/80 pt-3 text-xs">
        <label className="flex cursor-pointer items-center justify-between text-zinc-300">
          <span className="flex items-center">
            Exclude HDFC Income-Cap
            <InfoTip
              align="left"
              text="Filters out NYC HDFC & Mitchell-Lama income-restricted co-ops, which enforce strict household income caps (typically 120%–165% AMI)."
            />
          </span>
          <input
            type="checkbox"
            checked={knobs.exclude_hdfc}
            onChange={(e) => set("exclude_hdfc", e.target.checked)}
            className="accent-blue-400"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between text-zinc-300">
          <span>Filter by After-Tax Est.</span>
          <input
            type="checkbox"
            checked={knobs.use_after_tax_for_filter}
            onChange={(e) => set("use_after_tax_for_filter", e.target.checked)}
            className="accent-blue-400"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between text-zinc-300">
          <span>Show Rejected Listings</span>
          <input
            type="checkbox"
            checked={knobs.show_rejected}
            onChange={(e) => set("show_rejected", e.target.checked)}
            className="accent-blue-400"
          />
        </label>
      </div>
    </aside>
  );
}
