import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ScoredListing } from "../types";

interface AnalyticsViewProps {
  listings: ScoredListing[];
  maxMonthlyCost: number;
  onSelect: (item: ScoredListing) => void;
}

export function AnalyticsView({ listings, maxMonthlyCost, onSelect }: AnalyticsViewProps) {
  const scatterData = listings.map((item) => ({
    id: item.id,
    name: `${item.listing.address}${item.listing.unit ? ` #${item.listing.unit}` : ""}`,
    neighborhood: item.listing.neighborhood || item.listing.borough || "NYC",
    monthly: Math.round(item.costs.total_monthly_cost),
    score: item.score,
    sqft: item.listing.sqft || 750,
    price: item.listing.price,
    type: item.listing.property_type,
    passes: item.passes_filters,
    raw: item,
  }));

  const byHood = new Map<string, { hood: string; count: number; sumMonthly: number }>();
  for (const item of listings.filter((l) => l.passes_filters)) {
    const hood = item.listing.neighborhood || item.listing.borough || "Other";
    const cur = byHood.get(hood) || { hood, count: 0, sumMonthly: 0 };
    cur.count += 1;
    cur.sumMonthly += item.costs.total_monthly_cost;
    byHood.set(hood, cur);
  }
  const hoodData = Array.from(byHood.values())
    .map((h) => ({
      hood: h.hood.slice(0, 18),
      avgMonthly: Math.round(h.sumMonthly / h.count),
      count: h.count,
    }))
    .sort((a, b) => a.avgMonthly - b.avgMonthly)
    .slice(0, 12);

  return (
    <div className="grid h-full grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-2">
      {/* Scatter: Monthly Cost vs Composite Score */}
      <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Value Frontier: Monthly Cost vs. Composite Score
          </h3>
          <p className="text-xs text-slate-400">
            Top-left = best deals (lower monthly cost, higher score). Click any dot to inspect.
          </p>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                type="number"
                dataKey="monthly"
                name="Monthly"
                unit=""
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                stroke="#94a3b8"
                fontSize={11}
              />
              <YAxis type="number" dataKey="score" name="Score" domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
              <ZAxis type="number" dataKey="sqft" range={[50, 260]} />
              <ReferenceLine x={maxMonthlyCost} stroke="#f59e0b" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                formatter={(val, name) =>
                  name === "Monthly" ? [`$${Number(val).toLocaleString()}/mo`, name] : [val, name]
                }
                labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ""}
              />
              <Scatter
                data={scatterData}
                onClick={(pt) => {
                  if (pt?.raw) onSelect(pt.raw);
                }}
              >
                {scatterData.map((d) => (
                  <Cell
                    key={d.id}
                    fill={!d.passes ? "#64748b" : d.type === "condo" ? "#38bdf8" : "#10b981"}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Condo</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Co-op</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Max Monthly Knob</span>
        </div>
      </div>

      {/* Bar: Avg Monthly Cost by Neighborhood */}
      <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Average All-In Monthly Cost by Neighborhood (Matching)
          </h3>
          <p className="text-xs text-slate-400">
            Sorted cheapest to most expensive under your current knobs.
          </p>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hoodData} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} stroke="#94a3b8" fontSize={11} />
              <YAxis type="category" dataKey="hood" width={110} stroke="#cbd5e1" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                formatter={(val) => [`$${Number(val).toLocaleString()}/mo`, "Avg Monthly"]}
              />
              <Bar dataKey="avgMonthly" fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
