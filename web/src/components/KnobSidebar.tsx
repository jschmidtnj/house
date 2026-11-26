import { RotateCcw, Sliders } from "lucide-react";
import type { KnobsState } from "../types";

interface KnobSidebarProps {
  knobs: KnobsState;
  onChange: (next: KnobsState) => void;
  onReset: () => void;
  width: number;
}

const ALL_TYPES = ["condo", "coop", "condop", "townhouse", "multifamily"];

export function KnobSidebar({ knobs, onChange, onReset, width }: KnobSidebarProps) {
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
      style={{ width: `${width}px` }}
      className="flex h-full shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800/90 bg-zinc-950 p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Sliders className="h-3.5 w-3.5 text-blue-400" />
          <span>Budget &amp; Filters</span>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
          title="Reset to config/budget.yaml defaults"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* Primary Knob: Max Monthly Cost */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-zinc-300">Max Monthly Cost</label>
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
          <span className="text-zinc-400">Max Commute (Midtown)</span>
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
          <span className="text-zinc-400">NJ Walk to PATH</span>
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
          <span>2–3 Unit Rental Offset</span>
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

      {/* Toggles */}
      <div className="space-y-2 border-t border-zinc-800/80 pt-3 text-xs">
        <label className="flex cursor-pointer items-center justify-between text-zinc-300">
          <span>Exclude HDFC Income-Cap</span>
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
