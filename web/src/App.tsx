import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { AnalyticsView } from "./components/AnalyticsView";
import { CompareBar } from "./components/CompareBar";
import { KnobSidebar } from "./components/KnobSidebar";
import { ListingDrawer } from "./components/ListingDrawer";
import { ListingsFeed } from "./components/ListingsFeed";
import { NycMap } from "./components/NycMap";
import { TopHeader } from "./components/TopHeader";
import { DEFAULT_KNOBS, UI_CONFIG } from "./config";
import { useLists } from "./hooks/useLists";
import type { ConfigResponse, KnobsState, RankResponse, ScoredListing } from "./types";
import { applyUrlKnobs, buildUrlSearch, parseUrlUiState } from "./utils/urlState";

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function App() {
  const initialSearchRef = useRef<string>(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initialUrlUi = useMemo(() => parseUrlUiState(initialSearchRef.current), []);

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem(UI_CONFIG.themeStorageKey);
    if (saved === "light" || saved === "dark") return saved;
    return getSystemTheme();
  });
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= UI_CONFIG.desktopBreakpointPx : true
  );
  const [configLoaded, setConfigLoaded] = useState(false);
  const [baseKnobs, setBaseKnobs] = useState<KnobsState>(DEFAULT_KNOBS);
  const [knobs, setKnobs] = useState<KnobsState>(() =>
    applyUrlKnobs(DEFAULT_KNOBS, initialSearchRef.current)
  );
  const [targetNeighborhoods, setTargetNeighborhoods] = useState<string[]>([]);
  const [rankData, setRankData] = useState<RankResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [tab, setTab] = useState<"map" | "analytics">(initialUrlUi.tab);
  const [mobilePane, setMobilePane] = useState<"map" | "list">("map");
  const [selectedId, setSelectedId] = useState<number | null>(initialUrlUi.selectedId);
  const [focusedId, setFocusedId] = useState<number | null>(initialUrlUi.selectedId);
  const [directListing, setDirectListing] = useState<ScoredListing | null>(null);
  const [selectedBoroughs, setSelectedBoroughs] = useState<string[]>(initialUrlUi.selectedBoroughs);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>(
    initialUrlUi.selectedNeighborhoods
  );
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(UI_CONFIG.leftSidebar.defaultWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(UI_CONFIG.rightPanel.defaultWidth);
  const [showSidebar, setShowSidebar] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= UI_CONFIG.desktopBreakpointPx : true
  );
  const [showRightPanel, setShowRightPanel] = useState<boolean>(true);
  const [dragTarget, setDragTarget] = useState<"left" | "right" | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);

  const {
    savedIds,
    hiddenIds,
    customLists,
    activeList,
    setActiveList,
    toggleSave,
    toggleHide,
    createCustomList,
    toggleInCustomList,
    deleteCustomList,
  } = useLists(initialUrlUi.activeList);

  const selectListing = useCallback((id: number) => {
    setSelectedId(id);
    setFocusedId(id);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      const saved = window.localStorage.getItem(UI_CONFIG.themeStorageKey);
      if (saved !== "light" && saved !== "dark") {
        setTheme(e.matches ? "light" : "dark");
      }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= UI_CONFIG.desktopBreakpointPx);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!dragTarget) return;
    const onMove = (e: MouseEvent) => {
      if (dragTarget === "left") {
        setLeftSidebarWidth(
          Math.max(UI_CONFIG.leftSidebar.minWidth, Math.min(UI_CONFIG.leftSidebar.maxWidth, e.clientX))
        );
        return;
      }
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const clamped = Math.max(
        UI_CONFIG.rightPanel.minWidth,
        Math.min(Math.round(rect.width * UI_CONFIG.rightPanel.maxViewportRatio), rect.right - e.clientX)
      );
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
          current_monthly_rent: cfg.budget.current_monthly_rent ?? 5300,
          hold_years: cfg.budget.hold_years ?? 7,
          home_appreciation_pct: cfg.budget.home_appreciation_pct ?? 3.0,
          rent_growth_pct: cfg.budget.rent_growth_pct ?? 3.5,
          investment_return_pct: cfg.budget.investment_return_pct ?? 7.0,
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
        setKnobs(applyUrlKnobs(loaded, initialSearchRef.current));
        setTargetNeighborhoods(cfg.search.neighborhoods ?? []);
        setConfigLoaded(true);
      })
      .catch(() => {
        setConfigLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!configLoaded) return;
    const url = new URL(window.location.href);
    const nextSearch = buildUrlSearch(knobs, baseKnobs, {
      selectedId,
      activeList,
      selectedBoroughs,
      selectedNeighborhoods,
      tab,
    });
    window.history.replaceState(null, "", url.pathname + nextSearch + url.hash);
  }, [configLoaded, knobs, baseKnobs, selectedId, activeList, selectedBoroughs, selectedNeighborhoods, tab]);

  const fetchRanked = useCallback(async (state: KnobsState) => {
    setLoading(true);
    try {
      const { search_query: _ignored, ...serverPayload } = state;
      const resp = await fetch("/api/rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serverPayload),
      });
      const data: RankResponse = await resp.json();
      setRankData(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchRanked(knobs), UI_CONFIG.rankDebounceMs);
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

  const availableBoroughs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allListings) {
      const b = item.listing.borough || "Other";
      counts.set(b, (counts.get(b) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [allListings]);

  const availableNeighborhoods = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allListings) {
      if (selectedBoroughs.length > 0 && !selectedBoroughs.includes(item.listing.borough)) continue;
      const n = item.listing.neighborhood || item.listing.borough;
      if (n) counts.set(n, (counts.get(n) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [allListings, selectedBoroughs]);

  const listings = useMemo(() => {
    let out = allListings;
    if (activeList === "__hidden__") {
      out = out.filter((l) => hiddenIds.includes(l.id));
    } else {
      if (hiddenIds.length > 0) {
        out = out.filter((l) => !hiddenIds.includes(l.id));
      }
      if (activeList === "__favorites__") {
        out = out.filter((l) => savedIds.includes(l.id));
      } else if (activeList && customLists[activeList]) {
        const ids = customLists[activeList];
        out = out.filter((l) => ids.includes(l.id));
      }
    }
    if (selectedBoroughs.length > 0) {
      out = out.filter((l) => selectedBoroughs.includes(l.listing.borough));
    }
    if (selectedNeighborhoods.length > 0) {
      out = out.filter((l) =>
        selectedNeighborhoods.includes(l.listing.neighborhood || l.listing.borough)
      );
    }
    const q = knobs.search_query.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (s) =>
          s.listing.address.toLowerCase().includes(q) ||
          s.listing.neighborhood.toLowerCase().includes(q) ||
          s.listing.borough.toLowerCase().includes(q) ||
          s.listing.zip_code.toLowerCase().includes(q) ||
          s.nearest_station.toLowerCase().includes(q) ||
          s.listing.description.toLowerCase().includes(q)
      );
    }
    return out;
  }, [allListings, activeList, savedIds, hiddenIds, customLists, selectedBoroughs, selectedNeighborhoods, knobs.search_query]);

  useEffect(() => {
    if (selectedId == null || allListings.some((l) => l.id === selectedId)) {
      setDirectListing(null);
      return;
    }
    fetch(`/api/listings/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.id === selectedId) setDirectListing(d as ScoredListing);
      })
      .catch(() => {});
  }, [selectedId, allListings]);

  const selectedItem = useMemo(
    () => allListings.find((l) => l.id === selectedId) ?? (directListing?.id === selectedId ? directListing : null),
    [allListings, selectedId, directListing]
  );
  const pinnedItems = useMemo(
    () => allListings.filter((l) => pinnedIds.includes(l.id)),
    [allListings, pinnedIds]
  );

  const toggleBorough = (name: string) =>
    setSelectedBoroughs((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));

  const toggleNeighborhood = (name: string) =>
    setSelectedNeighborhoods((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
    );

  const addNeighborhood = (hood: string) => {
    if (!selectedNeighborhoods.includes(hood)) setSelectedNeighborhoods((prev) => [...prev, hood]);
  };

  const togglePin = (id: number) =>
    setPinnedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < UI_CONFIG.maxCompareItems
        ? [...prev, id]
        : [...prev.slice(1), id]
    );

  const resetAll = () => {
    setKnobs(baseKnobs);
    setSelectedBoroughs([]);
    setSelectedNeighborhoods([]);
  };

  const handleToggleHide = (id: number) => {
    const willHide = !hiddenIds.includes(id);
    toggleHide(id);
    if (willHide && activeList !== "__hidden__") {
      if (selectedId === id) setSelectedId(null);
      if (focusedId === id) setFocusedId(null);
    }
  };

  const sidebarProps = {
    knobs,
    onChange: setKnobs,
    onReset: resetAll,
    width: leftSidebarWidth,
    savedCount: savedIds.length,
    hiddenCount: hiddenIds.length,
    customLists,
    activeList,
    onCreateList: (name: string) => createCustomList(name),
    onDeleteList: deleteCustomList,
    availableBoroughs,
    selectedBoroughs,
    onToggleBorough: toggleBorough,
    availableNeighborhoods,
    selectedNeighborhoods,
    onToggleNeighborhood: toggleNeighborhood,
    onClearLocations: () => {
      setSelectedBoroughs([]);
      setSelectedNeighborhoods([]);
    },
  };

  const feedNode = (
    <ListingsFeed
      listings={listings}
      allListings={allListings}
      loading={loading}
      isDesktop={isDesktop}
      rightPanelWidth={rightPanelWidth}
      selectedId={selectedId ?? focusedId}
      savedIds={savedIds}
      hiddenIds={hiddenIds}
      pinnedIds={pinnedIds}
      useNetRental={knobs.use_net_rental_for_filter}
      searchQuery={knobs.search_query}
      onSearchChange={(q) => setKnobs({ ...knobs, search_query: q })}
      onSelectListing={(item) => selectListing(item.id)}
      onSelectNeighborhood={addNeighborhood}
      onToggleSave={toggleSave}
      onToggleHide={handleToggleHide}
      onTogglePin={togglePin}
    />
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <TopHeader
        isDesktop={isDesktop}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        showRightPanel={showRightPanel}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
        summary={rankData?.summary ?? null}
        listingsCount={listings.length}
        allListings={allListings}
        searchQuery={knobs.search_query}
        onSearchChange={(q) => setKnobs({ ...knobs, search_query: q })}
        onSelectListing={(item) => selectListing(item.id)}
        onSelectNeighborhood={addNeighborhood}
        savedCount={savedIds.length}
        activeList={activeList}
        onSelectList={setActiveList}
        tab={tab}
        onTabChange={setTab}
        mobilePane={mobilePane}
        onMobilePaneChange={setMobilePane}
        polling={polling}
        onPoll={handlePoll}
        theme={theme}
        onToggleTheme={() =>
          setTheme((t) => {
            const next = t === "dark" ? "light" : "dark";
            try {
              window.localStorage.setItem(UI_CONFIG.themeStorageKey, next);
            } catch {
              // ignore storage errors
            }
            return next;
          })
        }
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {isDesktop && showSidebar && (
          <>
            <KnobSidebar {...sidebarProps} onSelectList={setActiveList} />
            <div
              onMouseDown={() => setDragTarget("left")}
              className={`w-1.5 shrink-0 cursor-col-resize transition ${
                dragTarget === "left" ? "bg-blue-500/50" : "hover:bg-zinc-700/60"
              }`}
              title="Drag to resize knobs sidebar"
            />
          </>
        )}

        {!isDesktop && showSidebar && (
          <div className="fixed inset-0 z-[900] flex">
            <KnobSidebar
              {...sidebarProps}
              isMobile
              onClose={() => setShowSidebar(false)}
              onSelectList={(name) => {
                setActiveList(name);
                setShowSidebar(false);
              }}
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
                    selectedId={selectedId ?? focusedId}
                    onSelect={(item) => selectListing(item.id)}
                    theme={theme}
                    targetNeighborhoods={targetNeighborhoods}
                  />
                </div>
                {showRightPanel && (
                  <>
                    <div
                      onMouseDown={() => setDragTarget("right")}
                      className={`flex w-3 shrink-0 cursor-col-resize items-center justify-center ${
                        dragTarget === "right" ? "text-blue-400" : "text-zinc-600 hover:text-zinc-300"
                      }`}
                      title="Drag to resize listings panel"
                    >
                      <GripVertical className="h-5 w-4" />
                    </div>
                    {feedNode}
                  </>
                )}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col p-2">
                {mobilePane === "map" ? (
                  <div className="min-h-0 flex-1">
                    <NycMap
                      listings={listings}
                      selectedId={selectedId ?? focusedId}
                      onSelect={(item) => selectListing(item.id)}
                      theme={theme}
                      targetNeighborhoods={targetNeighborhoods}
                    />
                  </div>
                ) : (
                  feedNode
                )}
              </div>
            )
          ) : (
            <AnalyticsView
              listings={listings}
              maxMonthlyCost={knobs.max_monthly_cost}
              onSelect={(item) => selectListing(item.id)}
            />
          )}

          <CompareBar
            items={pinnedItems}
            onRemove={(id) => setPinnedIds((p) => p.filter((x) => x !== id))}
            onClear={() => setPinnedIds([])}
            onSelect={(item) => selectListing(item.id)}
          />
        </main>
      </div>

      <ListingDrawer
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onShowOnMap={() => {
          if (selectedId != null) setFocusedId(selectedId);
          setSelectedId(null);
          setTab("map");
          setMobilePane("map");
        }}
        isPinned={selectedId != null && pinnedIds.includes(selectedId)}
        onTogglePin={togglePin}
        isSaved={selectedId != null && savedIds.includes(selectedId)}
        onToggleSave={toggleSave}
        isHidden={selectedId != null && hiddenIds.includes(selectedId)}
        onToggleHide={handleToggleHide}
        customLists={customLists}
        onToggleInList={toggleInCustomList}
        onCreateList={createCustomList}
      />
    </div>
  );
}

export default App;
