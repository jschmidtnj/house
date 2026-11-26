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
  max_commute_minutes: 0,
  nj_max_walk_to_path_min: 15,
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
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(288);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(400);
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [dragTarget, setDragTarget] = useState<"left" | "right" | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dragTarget) return;
    const onMove = (e: MouseEvent) => {
      if (dragTarget === "left") {
        setLeftSidebarWidth(Math.max(240, Math.min(520, e.clientX)));
        return;
      }
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const clamped = Math.max(240, Math.min(Math.round(rect.width * 0.65), fromRight));
      setRightPanelWidth(clamped);
    };
    const onUp = () => setDragTarget(null);
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
  }, [dragTarget]);

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
          max_commute_minutes: cfg.search.max_commute_minutes ?? 0,
          nj_max_walk_to_path_min: cfg.search.nj_max_walk_to_path_min ?? 15,
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
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Top Bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800/90 bg-zinc-950 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
            title={showSidebar ? "Hide knobs sidebar" : "Show knobs sidebar"}
          >
            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-2 font-semibold tracking-tight text-zinc-100">
            <Building2 className="h-4 w-4 text-blue-400" />
            <span>house</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
              NYC
            </span>
          </div>
          <div className="hidden items-center gap-3 text-xs text-zinc-400 md:flex">
            <span>
              Matches: <strong className="text-zinc-100">{rankData?.summary.matching_count ?? 0}</strong> /{" "}
              {rankData?.summary.total_active ?? 0} active
            </span>
            {rankData && rankData.summary.avg_monthly_cost > 0 && (
              <span>
                Avg Monthly:{" "}
                <strong className="text-zinc-200">
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
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
              title={showRightPanel ? "Hide listings panel" : "Show listings panel"}
            >
              {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{showRightPanel ? "Hide List" : "Show List"}</span>
            </button>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter address, hood, zip..."
              value={knobs.search_query}
              onChange={(e) => setKnobs({ ...knobs, search_query: e.target.value })}
              className="w-48 rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
            <button
              onClick={() => setTab("map")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                tab === "map" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map &amp; List
            </button>
            <button
              onClick={() => setTab("analytics")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                tab === "analytics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </button>
          </div>

          <button
            onClick={handlePoll}
            disabled={polling}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
            {polling ? "Polling..." : "Poll Live"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {showSidebar && (
          <>
            <KnobSidebar
              knobs={knobs}
              onChange={setKnobs}
              onReset={() => setKnobs(baseKnobs)}
              width={leftSidebarWidth}
            />
            <div
              onMouseDown={() => setDragTarget("left")}
              className={`w-1.5 shrink-0 cursor-col-resize transition ${
                dragTarget === "left" ? "bg-blue-500/50" : "hover:bg-zinc-700/60"
              }`}
              title="Drag to resize knobs sidebar"
            />
          </>
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
                    onMouseDown={() => setDragTarget("right")}
                    className={`hidden w-3 shrink-0 cursor-col-resize items-center justify-center lg:flex ${
                      dragTarget === "right" ? "text-blue-400" : "text-zinc-600 hover:text-zinc-300"
                    }`}
                    title="Drag to resize listings panel"
                  >
                    <GripVertical className="h-5 w-4" />
                  </div>
                  <div
                    style={{ width: `${rightPanelWidth}px` }}
                    className="mt-3 flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 lg:mt-0"
                  >
                <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
                  <span>
                    {loading ? "Updating..." : `${listings.length} listings ranked by score`}
                  </span>
                  <span className="text-[11px] text-zinc-500">Click card to inspect</span>
                </div>
                <div className="flex-1 divide-y divide-zinc-800/80 overflow-y-auto">
                  {listings.map((item: ScoredListing) => {
                    const { listing: l, costs: c } = item;
                    const active = item.id === selectedId;
                    const pinned = pinnedIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer p-3 transition ${
                          active ? "bg-zinc-800/70" : "hover:bg-zinc-900/80"
                        } ${!item.passes_filters ? "opacity-60" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-zinc-100">
                              {l.address} {l.unit ? `#${l.unit}` : ""}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {l.neighborhood || l.borough} •{" "}
                              <span className="uppercase">{l.property_type}</span> • {l.beds}bd/{l.baths}ba
                              {l.sqft ? ` • ${l.sqft.toLocaleString()} sqft` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-zinc-50">
                              ${Math.round(c.rentable_units > 0 && knobs.use_net_rental_for_filter ? c.net_monthly_cost : c.total_monthly_cost).toLocaleString()}
                              <span className="text-[10px] font-normal text-zinc-400">
                                {c.rentable_units > 0 && knobs.use_net_rental_for_filter ? "/mo net" : "/mo"}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              ${Math.round(l.price).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-blue-500/15 px-1.5 py-0.5 font-medium text-blue-300">
                              {item.score.toFixed(1)}
                            </span>
                            {item.commute_minutes != null && (
                              <span
                                className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300"
                                title={item.nearest_station ? `Via ${item.nearest_station}` : "To Midtown"}
                              >
                                {item.commute_mode === "walk" ? "🚶" : "🚇"} {item.commute_minutes}m
                              </span>
                            )}
                            {c.rentable_units > 0 && (
                              <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 font-medium text-indigo-300">
                                {c.num_units}U (−${Math.round((c.estimated_net_rental_income / 1000) * 10) / 10}k)
                              </span>
                            )}
                            {c.dti_pct != null && (
                              <span
                                className={`rounded px-1.5 py-0.5 ${
                                  c.dti_pct <= 28
                                    ? "bg-teal-500/12 text-teal-300"
                                    : "bg-zinc-800 text-zinc-300"
                                }`}
                              >
                                {c.dti_pct}% DTI
                              </span>
                            )}
                            <span className="text-zinc-500">
                              Fees ${Math.round(c.monthly_hoa_or_maint + c.monthly_tax).toLocaleString()}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(item.id);
                            }}
                            className={`rounded p-1 ${
                              pinned ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
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
