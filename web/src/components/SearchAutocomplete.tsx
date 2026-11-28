import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPin, Search, TrainFront, X } from "lucide-react";
import type { ScoredListing } from "../types";

interface SearchAutocompleteProps {
  query: string;
  onQueryChange: (q: string) => void;
  listings: ScoredListing[];
  onSelectListing: (item: ScoredListing) => void;
  onSelectNeighborhood: (hood: string) => void;
  className?: string;
}

type Suggestion =
  | { kind: "neighborhood"; label: string; sub: string; count: number; value: string }
  | { kind: "station"; label: string; sub: string; count: number; value: string }
  | { kind: "listing"; label: string; sub: string; item: ScoredListing };

export function SearchAutocomplete({
  query,
  onQueryChange,
  listings,
  onSelectListing,
  onSelectNeighborhood,
  className = "",
}: SearchAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Press "/" to focus search bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Suggestion[] = [];

    // 1. Neighborhoods
    const hoodCounts = new Map<string, { boro: string; count: number }>();
    for (const item of listings) {
      const h = item.listing.neighborhood || item.listing.borough;
      if (!h) continue;
      const cur = hoodCounts.get(h) || { boro: item.listing.borough, count: 0 };
      cur.count += 1;
      hoodCounts.set(h, cur);
    }
    const matchingHoods = Array.from(hoodCounts.entries())
      .filter(([name, info]) => !q || name.toLowerCase().includes(q) || info.boro.toLowerCase().includes(q))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, q ? 4 : 6);

    for (const [name, info] of matchingHoods) {
      out.push({
        kind: "neighborhood",
        label: name,
        sub: info.boro !== name ? info.boro : "Area",
        count: info.count,
        value: name,
      });
    }

    // 2. Subway / PATH Stations (when typing)
    if (q.length >= 2) {
      const stCounts = new Map<string, { routes: string[]; count: number }>();
      for (const item of listings) {
        const st = item.nearest_station;
        if (!st) continue;
        const routesStr = item.nearest_routes.join(" ").toLowerCase();
        if (st.toLowerCase().includes(q) || routesStr.includes(q)) {
          const cur = stCounts.get(st) || { routes: item.nearest_routes, count: 0 };
          cur.count += 1;
          stCounts.set(st, cur);
        }
      }
      for (const [st, info] of Array.from(stCounts.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3)) {
        out.push({
          kind: "station",
          label: st,
          sub: info.routes.length ? `Lines: ${info.routes.join(" / ")}` : "Transit",
          count: info.count,
          value: st,
        });
      }
    }

    // 3. Direct Listing Matches (when typing)
    if (q.length >= 2) {
      const matchingListings = listings
        .filter((item) => {
          const l = item.listing;
          return (
            l.address.toLowerCase().includes(q) ||
            l.zip_code.includes(q) ||
            l.neighborhood.toLowerCase().includes(q) ||
            l.description.toLowerCase().includes(q)
          );
        })
        .slice(0, 5);

      for (const item of matchingListings) {
        const l = item.listing;
        const shownMo =
          item.costs.rentable_units > 0 ? item.costs.net_monthly_cost : item.costs.total_monthly_cost;
        out.push({
          kind: "listing",
          label: `${l.address}${l.unit ? ` #${l.unit}` : ""}`,
          sub: `${l.neighborhood || l.borough} • ${l.beds}bd/${l.baths}ba • $${Math.round(shownMo).toLocaleString()}/mo`,
          item,
        });
      }
    }

    return out;
  }, [query, listings]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [query, open]);

  const handleChoose = (s: Suggestion) => {
    if (s.kind === "neighborhood") {
      onSelectNeighborhood(s.value);
      onQueryChange("");
    } else if (s.kind === "station") {
      onQueryChange(s.value);
    } else {
      onSelectListing(s.item);
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search address, hood, transit, zip... (/)"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightIdx((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            handleChoose(suggestions[highlightIdx]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-8 pr-7 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
      />
      {query && (
        <button
          onClick={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1.5 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[1100] mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur">
          {!query.trim() && (
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Top Neighborhoods
            </div>
          )}
          {suggestions.map((s, idx) => {
            const active = idx === highlightIdx;
            return (
              <button
                key={`${s.kind}-${s.label}-${idx}`}
                onMouseEnter={() => setHighlightIdx(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleChoose(s);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                  active ? "bg-zinc-800 text-zinc-50" : "text-zinc-300 hover:bg-zinc-900"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {s.kind === "neighborhood" && <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                  {s.kind === "station" && <TrainFront className="h-3.5 w-3.5 shrink-0 text-teal-400" />}
                  {s.kind === "listing" && <Building2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.label}</div>
                    <div className="truncate text-[10px] text-zinc-500">{s.sub}</div>
                  </div>
                </div>
                {"count" in s && (
                  <span className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
