import { RotateCcw, Sliders } from "lucide-react";
import type { KnobsState } from "../types";

interface KnobSidebarProps {
  knobs: KnobsState;
  onChange: (next: KnobsState) => void;
  onReset: () => void;
}

const ALL_TYPES = ["condo", "coop", "condop", "townhouse", "multifamily"];

export function KnobSidebar({ knobs, onChange, onReset }: KnobSidebarProps) {
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
    <aside className="flex h-full w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-slate-950/90 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Sliders className="h-4 w-4 text-emerald-400" />
          <span>Budget & Search Knobs</span>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200"
          title="Reset to config/budget.yaml defaults"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* Primary Knob: Max Monthly Cost */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-emerald-300">Max Monthly Cost</label>
          <span className="text-base font-bold text-emerald-400">
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
          className="mt-2 w-full accent-emerald-400"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>$3k</span>
          <span className={targetDti > 28 ? "text-amber-400" : "text-emerald-400"}>
            {targetDti.toFixed(1)}% DTI {targetDti <= 28 ? "(Co-op OK)" : "(Condo stretch)"}
          </span>
          <span>$14k</span>
        </div>
      </div>

      {/* Max Asking Price */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Max Asking Price</span>
          <span className="font-semibold text-slate-100">
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
          className="w-full accent-sky-400"
        />
      </div>

      {/* Annual Salary */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Annual Salary (DTI)</span>
          <span className="font-semibold text-slate-100">
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
          className="w-full accent-sky-400"
        />
      </div>

      {/* Down Payment & Interest Rate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Down</span>
            <span className="font-semibold text-slate-100">{knobs.down_payment_pct}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={50}
            step={5}
            value={knobs.down_payment_pct}
            onChange={(e) => set("down_payment_pct", Number(e.target.value))}
            className="w-full accent-sky-400"
          />
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Rate</span>
            <span className="font-semibold text-slate-100">{knobs.interest_rate_pct.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min={4.5}
            max={8.5}
            step={0.125}
            value={knobs.interest_rate_pct}
            onChange={(e) => set("interest_rate_pct", Number(e.target.value))}
            className="w-full accent-sky-400"
          />
        </div>
      </div>

      {/* Min Beds & Sqft */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400">Min Beds</label>
          <select
            value={knobs.min_beds}
            onChange={(e) => set("min_beds", Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
          >
            <option value={0}>Studio+</option>
            <option value={1}>1+ Bed</option>
            <option value={2}>2+ Beds</option>
            <option value={3}>3+ Beds</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">Min Sqft</label>
          <input
            type="number"
            min={0}
            step={100}
            value={knobs.min_sqft}
            onChange={(e) => set("min_sqft", Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
          />
        </div>
      </div>

      {/* Property Types */}
      <div className="space-y-1.5">
        <span className="text-xs text-slate-400">Property Types</span>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TYPES.map((ptype) => {
            const active = knobs.property_types.includes(ptype);
            return (
              <button
                key={ptype}
                onClick={() => toggleType(ptype)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition ${
                  active
                    ? "border-sky-500/60 bg-sky-500/15 text-sky-300"
                    : "border-slate-800 bg-slate-900/50 text-slate-500 hover:text-slate-300"
                }`}
              >
                {ptype}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-3 Unit Townhouse House-Hacking Controls */}
      <div className="space-y-2 rounded-xl border border-violet-500/30 bg-violet-950/20 p-3">
        <div className="flex items-center justify-between text-xs font-semibold text-violet-300">
          <span>2–3 Unit House Hacking</span>
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
            className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
              knobs.min_units >= 2
                ? "border-violet-400 bg-violet-500/25 text-violet-200"
                : "border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            {knobs.min_units >= 2 ? "Multi-Unit Only" : "2–3 Unit Filter"}
          </button>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Est. Rent / Extra Unit</span>
            <span className="font-semibold text-violet-300">
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
            className="w-full accent-violet-400"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between text-[11px] text-slate-300">
          <span>Offset monthly cost by net rent (85%)</span>
          <input
            type="checkbox"
            checked={knobs.use_net_rental_for_filter}
            onChange={(e) => set("use_net_rental_for_filter", e.target.checked)}
            className="accent-violet-400"
          />
        </label>
      </div>

      {/* Toggles */}
      <div className="space-y-2 border-t border-slate-800 pt-3 text-xs">
        <label className="flex cursor-pointer items-center justify-between text-slate-300">
          <span>Exclude HDFC Income-Cap</span>
          <input
            type="checkbox"
            checked={knobs.exclude_hdfc}
            onChange={(e) => set("exclude_hdfc", e.target.checked)}
            className="accent-emerald-400"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between text-slate-300">
          <span>Filter by After-Tax Est.</span>
          <input
            type="checkbox"
            checked={knobs.use_after_tax_for_filter}
            onChange={(e) => set("use_after_tax_for_filter", e.target.checked)}
            className="accent-emerald-400"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between text-slate-300">
          <span>Show Rejected Listings</span>
          <input
            type="checkbox"
            checked={knobs.show_rejected}
            onChange={(e) => set("show_rejected", e.target.checked)}
            className="accent-amber-400"
          />
        </label>
      </div>
    </aside>
  );
}
