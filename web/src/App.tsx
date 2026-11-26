import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  GripVertical,
  Heart,
  List,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Scale,
  Search,
  Sliders,
} from "lucide-react";
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
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [baseKnobs, setBaseKnobs] = useState<KnobsState>(DEFAULT_KNOBS);
  const [knobs, setKnobs] = useState<KnobsState>(DEFAULT_KNOBS);
  const [rankData, setRankData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [tab, setTab] = useState<"map" | "analytics">("map");
  const [mobilePane, setMobilePane] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("listing");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [directListing, setDirectListing] = useState<ScoredListing | null>(null);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [customLists, setCustomLists] = useState<Record<string, number[]>>({});
  const [activeList, setActiveList] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(288);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(400);
  const [showSidebar, setShowSidebar] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [dragTarget, setDragTarget] = useState<"left" | "right" | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      .catch(() => { });

    fetch("/api/saved")
      .then((r) => (r.ok ? r.json() : { saved_ids: [] }))
      .then((d) => {
        if (Array.isArray(d.saved_ids)) setSavedIds(d.saved_ids);
      })
      .catch(() => { });

    fetch("/api/lists")
      .then((r) => (r.ok ? r.json() : { lists: {} }))
      .then((d) => {
        if (d && typeof d.lists === "object") setCustomLists(d.lists);
      })
      .catch(() => { });
  }, []);

  // Sync ?listing=<id> URL parameter whenever selectedId changes
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId != null) {
      url.searchParams.set("listing", String(selectedId));
    } else {
      url.searchParams.delete("listing");
    }
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [selectedId]);

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

  const allListings = rankData?.listings ?? [];
  const listings = useMemo(() => {
    if (activeList === "__favorites__") {
      return allListings.filter((l) => savedIds.includes(l.id));
    }
    if (activeList && customLists[activeList]) {
      const ids = customLists[activeList];
      return allListings.filter((l) => ids.includes(l.id));
    }
    return allListings;
  }, [allListings, activeList, savedIds, customLists]);

  // If URL deep-linked to a listing not in the current filtered set, fetch it directly
  useEffect(() => {
    if (selectedId == null) {
      setDirectListing(null);
      return;
    }
    if (allListings.some((l) => l.id === selectedId)) {
      setDirectListing(null);
      return;
    }
    fetch(`/api/listings/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.id === selectedId) setDirectListing(d as ScoredListing);
      })
      .catch(() => { });
  }, [selectedId, allListings]);

  const selectedItem = useMemo(
    () => allListings.find((l) => l.id === selectedId) ?? (directListing?.id === selectedId ? directListing : null),
    [allListings, selectedId, directListing]
  );
  const pinnedItems = useMemo(
    () => allListings.filter((l) => pinnedIds.includes(l.id)),
    [allListings, pinnedIds]
  );

  const toggleSave = async (id: number) => {
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    try {
      const resp = await fetch(`/api/saved/${id}`, { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.saved_ids)) setSavedIds(data.saved_ids);
      }
    } catch {
      // Keep optimistic state if offline
    }
  };

  const createCustomList = async (name: string, initialId?: number) => {
    const clean = name.trim();
    if (!clean) return;
    setCustomLists((prev) => ({
      ...prev,
      [clean]: initialId != null ? Array.from(new Set([...(prev[clean] || []), initialId])) : prev[clean] || [],
    }));
    try {
      if (initialId != null) {
        const resp = await fetch(`/api/lists/${encodeURIComponent(clean)}/toggle/${initialId}`, {
          method: "POST",
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.lists) setCustomLists(data.lists);
        }
      } else {
        const resp = await fetch("/api/lists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clean }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.lists) setCustomLists(data.lists);
        }
      }
    } catch {
      // Keep optimistic state
    }
  };

  const toggleInCustomList = async (listName: string, id: number) => {
    setCustomLists((prev) => {
      const cur = prev[listName] || [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [listName]: next };
    });
    try {
      const resp = await fetch(`/api/lists/${encodeURIComponent(listName)}/toggle/${id}`, {
        method: "POST",
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.lists) setCustomLists(data.lists);
      }
    } catch {
      // Keep optimistic state
    }
  };

  const deleteCustomList = async (listName: string) => {
    setCustomLists((prev) => {
      const next = { ...prev };
      delete next[listName];
      return next;
    });
    if (activeList === listName) setActiveList(null);
    try {
      const resp = await fetch(`/api/lists/${encodeURIComponent(listName)}`, { method: "DELETE" });
      if (resp.ok) {
        const data = await resp.json();
        if (data.lists) setCustomLists(data.lists);
      }
    } catch {
      // Keep optimistic state
    }
  };

  const togglePin = (id: number) => {
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : [...prev.slice(1), id]
    );
  };

  const renderListingsFeed = () => (
    <div
      style={isDesktop ? { width: `${rightPanelWidth}px` } : undefined}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 lg:flex-none lg:shrink-0"
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span>{loading ? "Updating..." : `${listings.length} listings ranked`}</span>
        <span className="text-[11px] text-zinc-500">Tap card to inspect</span>
      </div>
      {!isDesktop && (
        <div className="border-b border-zinc-800 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter address, hood, zip..."
              value={knobs.search_query}
              onChange={(e) => setKnobs({ ...knobs, search_query: e.target.value })}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      )}
      <div className="flex-1 divide-y divide-zinc-800/80 overflow-y-auto">
        {listings.map((item: ScoredListing) => {
          const { listing: l, costs: c } = item;
          const active = item.id === selectedId;
          const pinned = pinnedIds.includes(item.id);
          return (
            <div
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`cursor-pointer p-3 transition ${active ? "bg-zinc-800/70" : "hover:bg-zinc-900/80"
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
                    $
                    {Math.round(
                      c.rentable_units > 0 && knobs.use_net_rental_for_filter
                        ? c.net_monthly_cost
                        : c.total_monthly_cost
                    ).toLocaleString()}
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
                      className={`rounded px-1.5 py-0.5 ${c.dti_pct <= 28
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave(item.id);
                    }}
                    className={`rounded p-1 ${savedIds.includes(item.id)
                      ? "text-rose-400"
                      : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    title={savedIds.includes(item.id) ? "Favorited" : "Favorite listing"}
                  >
                    <Heart
                      className={`h-3.5 w-3.5 ${savedIds.includes(item.id) ? "fill-rose-400" : ""}`}
                    />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(item.id);
                    }}
                    className={`rounded p-1 ${pinned ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    title="Pin to Compare"
                  >
                    <Scale className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {listings.length === 0 && !loading && (
          <div className="p-8 text-center text-xs text-zinc-500">
            No listings match the current knobs. Try raising Max Monthly Cost or toggling "Show Rejected".
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Top Bar */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/90 bg-zinc-950 px-3 py-2 lg:px-4 lg:py-2.5">
        <div className="flex min-w-0 items-center gap-2 lg:gap-3">
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
            title={showSidebar ? "Hide filters" : "Show filters"}
          >
            {isDesktop ? (
              showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <Sliders className="h-3.5 w-3.5 text-blue-400" />
                <span>Filters</span>
              </>
            )}
          </button>

          <div className="hidden items-center gap-1.5 font-semibold tracking-tight text-zinc-100 sm:flex">
            <Building2 className="h-4 w-4 text-blue-400" />
            <span>find house</span>
          </div>

          <div className="hidden items-center gap-3 text-xs text-zinc-400 xl:flex">
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

        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
          <button
            onClick={() => setActiveList((cur) => (cur === "__favorites__" ? null : "__favorites__"))}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${activeList === "__favorites__"
              ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
              : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
              }`}
            title="Show favorited listings only"
          >
            <Heart
              className={`h-3.5 w-3.5 ${activeList === "__favorites__" ? "fill-rose-400 text-rose-400" : ""}`}
            />
            <span className="hidden sm:inline">Favorites</span>
            {savedIds.length > 0 && <span className="text-[10px]">({savedIds.length})</span>}
          </button>

          {activeList && activeList !== "__favorites__" && (
            <button
              onClick={() => setActiveList(null)}
              className="hidden items-center gap-1 rounded-lg border border-blue-500/50 bg-blue-500/15 px-2 py-1.5 text-xs font-medium text-blue-200 sm:flex"
              title="Click to clear list filter"
            >
              <span className="max-w-[110px] truncate">{activeList}</span>
              <span className="text-[10px] text-blue-300">×</span>
            </button>
          )}

          {isDesktop && tab === "map" && (
            <button
              onClick={() => setShowRightPanel((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
              title={showRightPanel ? "Hide listings panel" : "Show listings panel"}
            >
              {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              <span>{showRightPanel ? "Hide List" : "Show List"}</span>
            </button>
          )}

          {isDesktop && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Filter address, hood, zip..."
                value={knobs.search_query}
                onChange={(e) => setKnobs({ ...knobs, search_query: e.target.value })}
                className="w-44 rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none xl:w-52"
              />
            </div>
          )}

          {/* Mobile View Switcher (Map | List | Charts) vs Desktop (Map & List | Analytics) */}
          {isDesktop ? (
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
              <button
                onClick={() => setTab("map")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${tab === "map" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                  }`}
              >
                <MapIcon className="h-3.5 w-3.5" /> Map &amp; List
              </button>
              <button
                onClick={() => setTab("analytics")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${tab === "analytics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                  }`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Analytics
              </button>
            </div>
          ) : (
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
              <button
                onClick={() => {
                  setTab("map");
                  setMobilePane("map");
                }}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${tab === "map" && mobilePane === "map" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"
                  }`}
              >
                <MapIcon className="h-3.5 w-3.5" /> Map
              </button>
              <button
                onClick={() => {
                  setTab("map");
                  setMobilePane("list");
                }}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${tab === "map" && mobilePane === "list" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"
                  }`}
              >
                <List className="h-3.5 w-3.5" /> List
                <span className="hidden text-[10px] text-zinc-400 sm:inline">({listings.length})</span>
              </button>
              <button
                onClick={() => setTab("analytics")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${tab === "analytics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"
                  }`}
                aria-label="Analytics"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={handlePoll}
            disabled={polling}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-50"
            title="Poll live listings"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{polling ? "Polling..." : "Poll Live"}</span>
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Inline Resizable Sidebar */}
        {isDesktop && showSidebar && (
          <>
            <KnobSidebar
              knobs={knobs}
              onChange={setKnobs}
              onReset={() => setKnobs(baseKnobs)}
              width={leftSidebarWidth}
              savedCount={savedIds.length}
              customLists={customLists}
              activeList={activeList}
              onSelectList={setActiveList}
              onCreateList={(name) => createCustomList(name)}
              onDeleteList={deleteCustomList}
            />
            <div
              onMouseDown={() => setDragTarget("left")}
              className={`w-1.5 shrink-0 cursor-col-resize transition ${dragTarget === "left" ? "bg-blue-500/50" : "hover:bg-zinc-700/60"
                }`}
              title="Drag to resize knobs sidebar"
            />
          </>
        )}

        {/* Mobile Slide-Over Filters Drawer */}
        {!isDesktop && showSidebar && (
          <div className="fixed inset-0 z-[900] flex">
            <KnobSidebar
              knobs={knobs}
              onChange={setKnobs}
              onReset={() => setKnobs(baseKnobs)}
              width={leftSidebarWidth}
              isMobile
              onClose={() => setShowSidebar(false)}
              savedCount={savedIds.length}
              customLists={customLists}
              activeList={activeList}
              onSelectList={(name) => {
                setActiveList(name);
                setShowSidebar(false);
              }}
              onCreateList={(name) => createCustomList(name)}
              onDeleteList={deleteCustomList}
            />
            <div
              onClick={() => setShowSidebar(false)}
              className="flex-1 bg-black/60 backdrop-blur-[1px]"
            />
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {tab === "map" ? (
            isDesktop ? (
              <div ref={splitRef} className="flex min-h-0 flex-1 flex-row p-3">
                <div className="min-h-0 min-w-0 flex-1">
                  <NycMap
                    listings={listings}
                    selectedId={selectedId}
                    onSelect={(item) => setSelectedId(item.id)}
                  />
                </div>
                {showRightPanel && (
                  <>
                    <div
                      onMouseDown={() => setDragTarget("right")}
                      className={`flex w-3 shrink-0 cursor-col-resize items-center justify-center ${dragTarget === "right" ? "text-blue-400" : "text-zinc-600 hover:text-zinc-300"
                        }`}
                      title="Drag to resize listings panel"
                    >
                      <GripVertical className="h-5 w-4" />
                    </div>
                    {renderListingsFeed()}
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col p-2">
                {mobilePane === "map" ? (
                  <div className="min-h-0 flex-1">
                    <NycMap
                      listings={listings}
                      selectedId={selectedId}
                      onSelect={(item) => setSelectedId(item.id)}
                    />
                  </div>
                ) : (
                  renderListingsFeed()
                )}
              </div>
            )
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
        isSaved={selectedId != null && savedIds.includes(selectedId)}
        onToggleSave={toggleSave}
        customLists={customLists}
        onToggleInList={toggleInCustomList}
        onCreateList={createCustomList}
      />
    </div>
  );
}

export default App;
