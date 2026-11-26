import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Building2, GripVertical, Map as MapIcon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw, Scale, Search } from "lucide-react";
import { AnalyticsView } from "./components/AnalyticsView";
import { CompareBar } from "./components/CompareBar";
import { KnobSidebar } from "./components/KnobSidebar";
import { ListingDrawer } from "./components/ListingDrawer";
import { NycMap } from "./components/NycMap";
import type { ConfigResponse, KnobsState, RankResponse, ScoredListing } from "./types";

const DEFAULT_KNOBS: KnobsState = {
  annual_income: 300000,
  max_monthly_cost: 7000,
  max_price: 2000000,
  down_payment_pct: 20,
  interest_rate_pct: 6.5,
  loan_term_years: 30,
  use_after_tax_for_filter: false,
  est_rent_per_unit: 3200,
  use_net_rental_for_filter: true,
  min_units: 1,
  min_beds: 1,
  min_sqft: 600,
  property_types: ["condo", "coop", "condop", "townhouse", "multifamily"],
  exclude_hdfc: true,
  exclude_land_lease: false,
  show_rejected: false,
  search_query: "",
};

export function App() {
  const [baseKnobs, setBaseKnobs] = useState<KnobsState>(DEFAULT_KNOBS);
  const [knobs, setKnobs] = useState<KnobsState>(DEFAULT_KNOBS);
  const [rankData, setRankData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [tab, setTab] = useState<"map" | "analytics">("map");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(400);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const clamped = Math.max(240, Math.min(Math.round(rect.width * 0.65), fromRight));
      setRightPanelWidth(clamped);
    };
    const onUp = () => setIsDragging(false);
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
  }, [isDragging]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: ConfigResponse) => {
        const loaded: KnobsState = {
          annual_income: cfg.budget.annual_income ?? 300000,
          max_monthly_cost: cfg.budget.max_monthly_cost,
          max_price: cfg.budget.max_price,
          down_payment_pct: cfg.budget.down_payment_pct,
          interest_rate_pct: cfg.budget.interest_rate_pct,
          loan_term_years: cfg.budget.loan_term_years,
          use_after_tax_for_filter: cfg.budget.use_after_tax_for_filter,
          est_rent_per_unit: cfg.budget.est_rent_per_unit ?? 3200,
          use_net_rental_for_filter: cfg.budget.use_net_rental_for_filter ?? true,
          min_units: cfg.search.min_units ?? 1,
          min_beds: cfg.search.min_beds,
          min_sqft: cfg.search.min_sqft,
          property_types: cfg.search.property_types,
          exclude_hdfc: cfg.search.exclude_hdfc,
          exclude_land_lease: cfg.search.exclude_land_lease,
          show_rejected: false,
          search_query: "",
        };
        setBaseKnobs(loaded);
        setKnobs(loaded);
      })
      .catch(() => {});
  }, []);

  const fetchRanked = useCallback(async (state: KnobsState) => {
    setLoading(true);
    try {
      const resp = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const data: RankResponse = await resp.json();
      setRankData(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRanked(knobs);
    }, 120);
    return () => clearTimeout(timer);
  }, [knobs, fetchRanked]);

  const handlePoll = async () => {
    setPolling(true);
    try {
      await fetch("/api/poll", { method: "POST" });
      await fetchRanked(knobs);
    } finally {
      setPolling(false);
    }
  };

  const listings = rankData?.listings ?? [];
  const selectedItem = useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId]
  );
  const pinnedItems = useMemo(
    () => listings.filter((l) => pinnedIds.includes(l.id)),
    [listings, pinnedIds]
  );

  const togglePin = (id: number) => {
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : [...prev.slice(1), id]
    );
  };

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      {/* Top Bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:border-slate-700 hover:text-slate-100"
            title={showSidebar ? "Hide knobs sidebar" : "Show knobs sidebar"}
          >
            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-2 font-bold tracking-tight text-slate-100">
            <Building2 className="h-5 w-5 text-emerald-400" />
            <span>house</span>
            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
              NYC
            </span>
          </div>
          <div className="hidden items-center gap-3 text-xs text-slate-400 md:flex">
            <span>
              Matches: <strong className="text-emerald-400">{rankData?.summary.matching_count ?? 0}</strong> /{" "}
              {rankData?.summary.total_active ?? 0} active
            </span>
            {rankData && rankData.summary.avg_monthly_cost > 0 && (
              <span>
                Avg Monthly:{" "}
                <strong className="text-slate-200">
                  ${Math.round(rankData.summary.avg_monthly_cost).toLocaleString()}/mo
                </strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tab === "map" && (
            <button
              onClick={() => setShowRightPanel((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-slate-100"
              title={showRightPanel ? "Hide listings panel" : "Show listings panel"}
            >
              {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{showRightPanel ? "Hide List" : "Show List"}</span>
            </button>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter address, hood, zip..."
              value={knobs.search_query}
              onChange={(e) => setKnobs({ ...knobs, search_query: e.target.value })}
              className="w-48 rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-xs">
            <button
              onClick={() => setTab("map")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                tab === "map" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map &amp; List
            </button>
            <button
              onClick={() => setTab("analytics")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                tab === "analytics" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </button>
          </div>

          <button
            onClick={handlePoll}
            disabled={polling}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
            {polling ? "Polling..." : "Poll Live"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {showSidebar && (
          <KnobSidebar knobs={knobs} onChange={setKnobs} onReset={() => setKnobs(baseKnobs)} />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {tab === "map" ? (
            <div ref={splitRef} className="flex min-h-0 flex-1 flex-col p-3 lg:flex-row">
              {/* Interactive NYC Map */}
              <div className="min-h-[360px] min-w-0 flex-1">
                <NycMap
                  listings={listings}
                  selectedId={selectedId}
                  onSelect={(item) => setSelectedId(item.id)}
                />
              </div>

              {/* Draggable Split Handle + Ranked Listings Feed */}
              {showRightPanel && (
                <>
                  <div
                    onMouseDown={() => setIsDragging(true)}
                    className={`hidden w-3 shrink-0 cursor-col-resize items-center justify-center lg:flex ${
                      isDragging ? "text-emerald-400" : "text-slate-600 hover:text-slate-300"
                    }`}
                    title="Drag to resize listings panel"
                  >
                    <GripVertical className="h-5 w-4" />
                  </div>
                  <div
                    style={{ width: `${rightPanelWidth}px` }}
                    className="mt-3 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 lg:mt-0"
                  >
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
                  <span>
                    {loading ? "Updating..." : `${listings.length} listings ranked by score`}
                  </span>
                  <span className="text-[11px] text-slate-500">Click card to fly &amp; inspect</span>
                </div>
                <div className="flex-1 divide-y divide-slate-800/80 overflow-y-auto">
                  {listings.map((item: ScoredListing) => {
                    const { listing: l, costs: c } = item;
                    const active = item.id === selectedId;
                    const pinned = pinnedIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer p-3 transition ${
                          active ? "bg-slate-800/70" : "hover:bg-slate-900/80"
                        } ${!item.passes_filters ? "opacity-65" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-slate-100">
                              {l.address} {l.unit ? `#${l.unit}` : ""}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {l.neighborhood || l.borough} •{" "}
                              <span className="uppercase">{l.property_type}</span> • {l.beds}bd/{l.baths}ba
                              {l.sqft ? ` • ${l.sqft.toLocaleString()} sqft` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-bold text-emerald-400">
                              ${Math.round(c.rentable_units > 0 && knobs.use_net_rental_for_filter ? c.net_monthly_cost : c.total_monthly_cost).toLocaleString()}
                              <span className="text-[10px] font-normal text-slate-400">
                                {c.rentable_units > 0 && knobs.use_net_rental_for_filter ? "/mo net" : "/mo"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              ${Math.round(l.price).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-semibold text-sky-300">
                              Score {item.score.toFixed(1)}
                            </span>
                            {c.rentable_units > 0 && (
                              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-semibold text-violet-300">
                                {c.num_units} Units (−${Math.round(c.estimated_net_rental_income / 1000 * 10) / 10}k rent)
                              </span>
                            )}
                            {c.dti_pct != null && (
                              <span
                                className={`rounded px-1.5 py-0.5 ${
                                  c.dti_pct <= 28
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-amber-500/15 text-amber-300"
                                }`}
                              >
                                {c.dti_pct}% DTI
                              </span>
                            )}
                            <span className="text-slate-500">
                              Fees+Tax ${Math.round(c.monthly_hoa_or_maint + c.monthly_tax).toLocaleString()}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(item.id);
                            }}
                            className={`rounded p-1 ${
                              pinned ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
                            }`}
                            title="Pin to Compare"
                          >
                            <Scale className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {listings.length === 0 && !loading && (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No listings match the current knobs. Try raising Max Monthly Cost or toggling "Show Rejected".
                    </div>
                  )}
                </div>
              </div>
                </>
              )}
            </div>
          ) : (
            <AnalyticsView
              listings={listings}
              maxMonthlyCost={knobs.max_monthly_cost}
              onSelect={(item) => setSelectedId(item.id)}
            />
          )}

          <CompareBar
            items={pinnedItems}
            onRemove={(id) => setPinnedIds((p) => p.filter((x) => x !== id))}
            onClear={() => setPinnedIds([])}
            onSelect={(item) => setSelectedId(item.id)}
          />
        </main>
      </div>

      <ListingDrawer
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        isPinned={selectedId != null && pinnedIds.includes(selectedId)}
        onTogglePin={togglePin}
      />
    </div>
  );
}

export default App;
