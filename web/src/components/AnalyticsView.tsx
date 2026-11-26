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
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-zinc-100">
            Value Frontier: Monthly Cost vs. Composite Score
          </h3>
          <p className="text-xs text-zinc-400">
            Top-left = best deals (lower monthly cost, higher score). Click any dot to inspect.
          </p>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 20, bottom: 16, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-800)" />
              <XAxis
                type="number"
                dataKey="monthly"
                name="Monthly"
                unit=""
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                stroke="var(--color-zinc-400)"
                fontSize={11}
              />
              <YAxis
                type="number"
                dataKey="score"
                name="Score"
                domain={[0, 100]}
                stroke="var(--color-zinc-400)"
                fontSize={11}
              />
              <ZAxis type="number" dataKey="sqft" range={[50, 260]} />
              <ReferenceLine x={maxMonthlyCost} stroke="var(--color-zinc-200)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: "var(--color-zinc-600)" }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl">
                      <div className="font-semibold text-zinc-100">{d.name}</div>
                      <div className="mb-1 text-[11px] text-zinc-400">
                        {d.neighborhood} • <span className="uppercase">{d.type}</span>
                      </div>
                      <div className="space-y-0.5 text-[11px] text-zinc-300">
                        <div>
                          Monthly: <strong className="text-zinc-50">${Number(d.monthly).toLocaleString()}/mo</strong>
                        </div>
                        <div>
                          Score: <strong className="text-blue-400">{d.score}</strong> • Price:{" "}
                          <strong className="text-zinc-100">${Math.round(d.price / 1000)}k</strong>
                        </div>
                        <div>
                          Size: <strong className="text-zinc-100">{d.sqft.toLocaleString()} sqft</strong>
                        </div>
                      </div>
                    </div>
                  );
                }}
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
                    fill={!d.passes ? "#52525b" : d.type === "condo" ? "#60a5fa" : "#2dd4bf"}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Condo</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-teal-400" /> Co-op / Multi</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-200" /> Max Monthly Knob</span>
        </div>
      </div>

      {/* Bar: Avg Monthly Cost by Neighborhood */}
      <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-zinc-100">
            Average All-In Monthly Cost by Neighborhood (Matching)
          </h3>
          <p className="text-xs text-zinc-400">
            Sorted cheapest to most expensive under your current knobs.
          </p>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hoodData} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-zinc-800)" />
              <XAxis
                type="number"
                tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                stroke="var(--color-zinc-400)"
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="hood"
                width={110}
                stroke="var(--color-zinc-200)"
                fontSize={11}
              />
              <Tooltip
                cursor={{ fill: "var(--color-zinc-800)", fillOpacity: 0.35 }}
                contentStyle={{
                  backgroundColor: "var(--color-zinc-950)",
                  border: "1px solid var(--color-zinc-700)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-zinc-100)",
                }}
                labelStyle={{ color: "var(--color-zinc-50)", fontWeight: 600 }}
                itemStyle={{ color: "var(--color-blue-400)" }}
                formatter={(val) => [`$${Number(val).toLocaleString()}/mo`, "Avg Monthly"]}
              />
              <Bar dataKey="avgMonthly" fill="var(--color-blue-400)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
