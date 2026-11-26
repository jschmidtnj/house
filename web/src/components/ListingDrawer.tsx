import { AlertTriangle, ExternalLink, Scale, X } from "lucide-react";
import type { ScoredListing } from "../types";

interface ListingDrawerProps {
  item: ScoredListing | null;
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: (id: number) => void;
}

export function ListingDrawer({ item, onClose, isPinned, onTogglePin }: ListingDrawerProps) {
  if (!item) return null;

  const { listing: l, costs: c } = item;
  const total = c.total_monthly_cost || 1;
  const piPct = (c.monthly_mortgage_pi / total) * 100;
  const feePct = (c.monthly_hoa_or_maint / total) * 100;
  const taxPct = (c.monthly_tax / total) * 100;
  const insPct = (c.monthly_insurance / total) * 100;
  const feeLabel = l.property_type === "coop" ? "Co-op Maintenance" : "Common Charges";

  return (
    <div className="fixed inset-y-0 right-0 z-[1000] flex w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-100">
            {l.address} {l.unit ? `#${l.unit}` : ""}
          </h2>
          <p className="text-xs text-slate-400">
            {l.neighborhood || l.borough} {l.zip_code ? `• ${l.zip_code}` : ""} •{" "}
            <span className="uppercase">{l.property_type}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTogglePin(item.id)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
              isPinned
                ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                : "border-slate-700 text-slate-300 hover:border-slate-600"
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            {isPinned ? "Pinned" : "Compare"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
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
            className="h-48 w-full rounded-xl border border-slate-800 object-cover"
          />
        )}

        {/* Headline Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
            <div className="text-[11px] text-slate-400">
              {c.rentable_units > 0 ? "Net Out-of-Pocket" : "All-In Monthly"}
            </div>
            <div className="text-base font-bold text-emerald-400">
              ${Math.round(c.rentable_units > 0 ? c.net_monthly_cost : c.total_monthly_cost).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500">
              {c.rentable_units > 0
                ? `$${Math.round(c.total_monthly_cost).toLocaleString()} gross`
                : `~$${Math.round(c.effective_after_tax_monthly).toLocaleString()} after-tax`}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
            <div className="text-[11px] text-slate-400">Asking Price</div>
            <div className="text-base font-bold text-slate-100">
              ${Math.round(l.price).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500">
              {item.price_per_sqft ? `$${item.price_per_sqft.toLocaleString()}/sqft` : "Sqft N/A"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
            <div className="text-[11px] text-slate-400">Score / DTI</div>
            <div className="text-base font-bold text-sky-400">{item.score.toFixed(1)}</div>
            <div className="text-[10px] text-slate-500">
              {c.dti_pct != null ? `${c.dti_pct}% gross DTI` : "DTI N/A"}
            </div>
          </div>
        </div>

        {/* Stacked Monthly Cost Bar */}
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <div className="text-xs font-semibold text-slate-200">Monthly Cost Breakdown</div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div style={{ width: `${piPct}%` }} className="bg-sky-500" title="Mortgage P&I" />
            <div style={{ width: `${feePct}%` }} className="bg-amber-400" title={feeLabel} />
            <div style={{ width: `${taxPct}%` }} className="bg-rose-400" title="Property Tax" />
            <div style={{ width: `${insPct}%` }} className="bg-emerald-400" title="Insurance" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-sky-500" /> Mortgage P&amp;I ({c.interest_rate_pct}%, {c.loan_term_years}y)
              </span>
              <span className="font-medium text-slate-100">${Math.round(c.monthly_mortgage_pi).toLocaleString()}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> {feeLabel}
              </span>
              <span className="font-medium text-slate-100">${Math.round(c.monthly_hoa_or_maint).toLocaleString()}/mo</span>
            </div>
            {l.property_type !== "coop" && (
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-rose-400" /> Monthly Property Tax
                </span>
                <span className="font-medium text-slate-100">${Math.round(c.monthly_tax).toLocaleString()}/mo</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Building / HO-6 Insurance
              </span>
              <span className="font-medium text-slate-100">${Math.round(c.monthly_insurance).toLocaleString()}/mo</span>
            </div>
            {c.rentable_units > 0 && (
              <>
                <div className="flex justify-between border-t border-slate-800 pt-1 text-violet-300">
                  <span>− Rental Offset ({c.rentable_units} unit{c.rentable_units > 1 ? "s" : ""}, 85% net)</span>
                  <span className="font-semibold">−${Math.round(c.estimated_net_rental_income).toLocaleString()}/mo</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-400">
                  <span>Net Out-of-Pocket ({c.num_units}-Unit House Hack)</span>
                  <span>${Math.round(c.net_monthly_cost).toLocaleString()}/mo</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Upfront Cash to Close */}
        <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs">
          <div className="font-semibold text-slate-200">NYC Cash to Close Estimate</div>
          <div className="flex justify-between text-slate-400">
            <span>Down Payment ({c.down_payment_pct}%)</span>
            <span className="text-slate-100">${Math.round(c.down_payment_amount).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Closing Costs {c.mansion_tax > 0 ? `(incl. $${Math.round(c.mansion_tax).toLocaleString()} Mansion Tax)` : ""}</span>
            <span className="text-slate-100">${Math.round(c.estimated_closing_costs).toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t border-slate-800 pt-1.5 font-semibold text-slate-100">
            <span>Total Est. Cash Needed</span>
            <span className="text-amber-300">${Math.round(c.estimated_cash_to_close).toLocaleString()}</span>
          </div>
        </div>

        {/* Warnings / Rejections */}
        {(c.warnings.length > 0 || item.rejection_reasons.length > 0) && (
          <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
            <div className="flex items-center gap-1.5 font-semibold text-amber-300">
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
        <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <div className="text-xs font-semibold text-slate-200">Score Factors</div>
          {Object.entries(item.score_components).map(([key, val]) => (
            <div key={key} className="space-y-0.5 text-[11px]">
              <div className="flex justify-between text-slate-400">
                <span className="capitalize">{key.replace(/_/g, " ")}</span>
                <span className="text-slate-200">{val.toFixed(0)}/100</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div style={{ width: `${val}%` }} className="h-full rounded-full bg-sky-400" />
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
                className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[11px] text-slate-300"
              >
                {a.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {l.description && (
          <p className="text-xs leading-relaxed text-slate-400">{l.description}</p>
        )}
      </div>

      {l.url && (
        <div className="border-t border-slate-800 p-3">
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Open Full Listing <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
