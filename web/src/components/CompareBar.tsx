import { Scale, X } from "lucide-react";
import type { ScoredListing } from "../types";

interface CompareBarProps {
  items: ScoredListing[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onSelect: (item: ScoredListing) => void;
}

export function CompareBar({ items, onRemove, onClear, onSelect }: CompareBarProps) {
  if (items.length === 0) return null;

  return (
    <div className="border-t border-amber-500/40 bg-slate-950/95 px-4 py-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Scale className="h-4 w-4" />
          <span>Side-by-Side Comparison ({items.length}/3)</span>
        </div>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-slate-200">
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {items.map((item) => {
          const { listing: l, costs: c } = item;
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 text-xs hover:border-amber-500/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="truncate font-semibold text-slate-100">
                  {l.address} {l.unit ? `#${l.unit}` : ""}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.id);
                  }}
                  className="text-slate-500 hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                <span>Monthly: <strong className="text-emerald-400">${Math.round(c.total_monthly_cost).toLocaleString()}</strong></span>
                <span>DTI: <strong className="text-slate-200">{c.dti_pct ?? "-"}%</strong></span>
                <span>Price: <strong className="text-slate-200">${Math.round(l.price).toLocaleString()}</strong></span>
                <span>Cash: <strong className="text-amber-300">${Math.round(c.estimated_cash_to_close / 1000)}k</strong></span>
                <span>Fees+Tax: <strong className="text-slate-200">${Math.round(c.monthly_hoa_or_maint + c.monthly_tax).toLocaleString()}</strong></span>
                <span>Score: <strong className="text-sky-400">{item.score}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
