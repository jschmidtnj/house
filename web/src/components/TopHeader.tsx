import {
  BarChart3,
  Building2,
  Heart,
  List,
  Map as MapIcon,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Sliders,
  Sun,
} from "lucide-react";
import type { RankSummary, ScoredListing } from "../types";
import { SearchAutocomplete } from "./SearchAutocomplete";

interface TopHeaderProps {
  isDesktop: boolean;
  showSidebar: boolean;
  onToggleSidebar: () => void;
  showRightPanel: boolean;
  onToggleRightPanel: () => void;
  summary: RankSummary | null;
  listingsCount: number;
  allListings: ScoredListing[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectListing: (item: ScoredListing) => void;
  onSelectNeighborhood: (hood: string) => void;
  savedCount: number;
  activeList: string | null;
  onSelectList: (name: string | null) => void;
  tab: "map" | "analytics";
  onTabChange: (t: "map" | "analytics") => void;
  mobilePane: "map" | "list";
  onMobilePaneChange: (p: "map" | "list") => void;
  polling: boolean;
  onPoll: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function TopHeader({
  isDesktop,
  showSidebar,
  onToggleSidebar,
  showRightPanel,
  onToggleRightPanel,
  summary,
  listingsCount,
  allListings,
  searchQuery,
  onSearchChange,
  onSelectListing,
  onSelectNeighborhood,
  savedCount,
  activeList,
  onSelectList,
  tab,
  onTabChange,
  mobilePane,
  onMobilePaneChange,
  polling,
  onPoll,
  theme,
  onToggleTheme,
}: TopHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800/90 bg-zinc-950 px-3 py-2 lg:px-4 lg:py-2.5">
      <div className="flex min-w-0 items-center gap-2 lg:gap-3">
        <button
          onClick={onToggleSidebar}
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
          <span>house</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
            NYC
          </span>
        </div>

        <div className="hidden items-center gap-3 text-xs text-zinc-400 xl:flex">
          <span>
            Matches: <strong className="text-zinc-100">{summary?.matching_count ?? 0}</strong> /{" "}
            {summary?.total_active ?? 0} active
          </span>
          {summary && summary.avg_monthly_cost > 0 && (
            <span>
              Avg Monthly:{" "}
              <strong className="text-zinc-200">
                ${Math.round(summary.avg_monthly_cost).toLocaleString()}/mo
              </strong>
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
        <button
          onClick={() => onSelectList(activeList === "__favorites__" ? null : "__favorites__")}
          className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
            activeList === "__favorites__"
              ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
              : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
          }`}
          title="Show favorited listings only"
        >
          <Heart
            className={`h-3.5 w-3.5 ${activeList === "__favorites__" ? "fill-rose-400 text-rose-400" : ""}`}
          />
          <span className="hidden sm:inline">Favorites</span>
          {savedCount > 0 && <span className="text-[10px]">({savedCount})</span>}
        </button>

        {activeList && activeList !== "__favorites__" && (
          <button
            onClick={() => onSelectList(null)}
            className="hidden items-center gap-1 rounded-lg border border-blue-500/50 bg-blue-500/15 px-2 py-1.5 text-xs font-medium text-blue-200 sm:flex"
            title="Click to clear list filter"
          >
            <span className="max-w-[110px] truncate">
              {activeList === "__hidden__" ? "Hidden" : activeList}
            </span>
            <span className="text-[10px] text-blue-300">×</span>
          </button>
        )}

        {isDesktop && tab === "map" && (
          <button
            onClick={onToggleRightPanel}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
            title={showRightPanel ? "Hide listings panel" : "Show listings panel"}
          >
            {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span>{showRightPanel ? "Hide List" : "Show List"}</span>
          </button>
        )}

        {isDesktop && (
          <SearchAutocomplete
            query={searchQuery}
            onQueryChange={onSearchChange}
            listings={allListings}
            onSelectListing={onSelectListing}
            onSelectNeighborhood={onSelectNeighborhood}
            className="w-56 xl:w-64"
          />
        )}

        {isDesktop ? (
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
            <button
              onClick={() => onTabChange("map")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                tab === "map" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map &amp; List
            </button>
            <button
              onClick={() => onTabChange("analytics")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${
                tab === "analytics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </button>
          </div>
        ) : (
          <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
            <button
              onClick={() => {
                onTabChange("map");
                onMobilePaneChange("map");
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                tab === "map" && mobilePane === "map" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" /> Map
            </button>
            <button
              onClick={() => {
                onTabChange("map");
                onMobilePaneChange("list");
              }}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                tab === "map" && mobilePane === "list" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
              <span className="hidden text-[10px] text-zinc-400 sm:inline">({listingsCount})</span>
            </button>
            <button
              onClick={() => onTabChange("analytics")}
              className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                tab === "analytics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400"
              }`}
              aria-label="Analytics"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <button
          onClick={onToggleTheme}
          className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={onPoll}
          disabled={polling}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:opacity-90 disabled:opacity-50"
          title="Poll live listings"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{polling ? "Polling..." : "Poll Live"}</span>
        </button>
      </div>
    </header>
  );
}
