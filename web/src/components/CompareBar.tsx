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
    <div className="border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-300">
          <Scale className="h-4 w-4" />
          <span>Side-by-Side Comparison ({items.length}/3)</span>
        </div>
        <button onClick={onClear} className="text-xs text-zinc-400 hover:text-zinc-200">
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
                <span>Monthly: <strong className="text-zinc-100">${Math.round(c.rentable_units > 0 ? c.net_monthly_cost : c.total_monthly_cost).toLocaleString()}</strong></span>
                <span>DTI: <strong className="text-zinc-200">{c.dti_pct ?? "-"}%</strong></span>
                <span>Price: <strong className="text-zinc-200">${Math.round(l.price).toLocaleString()}</strong></span>
                <span>Cash: <strong className="text-zinc-200">${Math.round(c.estimated_cash_to_close / 1000)}k</strong></span>
                <span>Fees+Tax: <strong className="text-zinc-200">${Math.round(c.monthly_hoa_or_maint + c.monthly_tax).toLocaleString()}</strong></span>
                <span>Score: <strong className="text-blue-400">{item.score}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
