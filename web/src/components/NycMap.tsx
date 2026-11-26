import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Layers, TrainFront } from "lucide-react";
import type { ScoredListing } from "../types";

interface NycMapProps {
  listings: ScoredListing[];
  selectedId: number | null;
  onSelect: (item: ScoredListing) => void;
}

type BasemapStyle = "dark" | "light" | "streets";

interface SubwayStation {
  name: string;
  routes: string[];
  borough: string;
  lat: number;
  lng: number;
}

const BASEMAPS: Record<BasemapStyle, { label: string; urls: string[]; attribution: string }> = {
  dark: {
    label: "Clean Dark",
    urls: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "&copy; Esri, OpenStreetMap",
  },
  light: {
    label: "Clean Light",
    urls: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "&copy; Esri, OpenStreetMap",
  },
  streets: {
    label: "Streets",
    urls: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "&copy; OpenStreetMap contributors",
  },
};

const TARGET_HOOD_KEYWORDS = [
  "east village",
  "lower east side",
  "chinatown",
  "two bridges",
  "financial district",
  "battery park",
  "west village",
  "greenwich village",
  "chelsea",
  "tribeca",
  "soho",
  "noho",
  "nolita",
  "little italy",
  "gramercy",
  "flatiron",
  "kips bay",
  "murray hill",
  "midtown",
  "turtle bay",
  "sutton place",
  "williamsburg",
  "greenpoint",
  "dumbo",
  "vinegar hill",
  "navy yard",
  "downtown brooklyn",
  "bedford-stuyvesant",
  "bushwick",
  "fort greene",
  "clinton hill",
  "boerum hill",
  "cobble hill",
  "carroll gardens",
  "columbia st",
  "red hook",
  "brooklyn heights",
  "long island city",
  "hunters point",
  "astoria",
];

const MTA_COLORS: Record<string, { bg: string; fg: string }> = {
  A: { bg: "#2850AD", fg: "#fff" },
  C: { bg: "#2850AD", fg: "#fff" },
  E: { bg: "#2850AD", fg: "#fff" },
  B: { bg: "#FF6319", fg: "#fff" },
  D: { bg: "#FF6319", fg: "#fff" },
  F: { bg: "#FF6319", fg: "#fff" },
  M: { bg: "#FF6319", fg: "#fff" },
  G: { bg: "#6CBE45", fg: "#fff" },
  J: { bg: "#996633", fg: "#fff" },
  Z: { bg: "#996633", fg: "#fff" },
  L: { bg: "#A7A9AC", fg: "#0f172a" },
  N: { bg: "#FCCC0A", fg: "#0f172a" },
  Q: { bg: "#FCCC0A", fg: "#0f172a" },
  R: { bg: "#FCCC0A", fg: "#0f172a" },
  W: { bg: "#FCCC0A", fg: "#0f172a" },
  "1": { bg: "#EE352E", fg: "#fff" },
  "2": { bg: "#EE352E", fg: "#fff" },
  "3": { bg: "#EE352E", fg: "#fff" },
  "4": { bg: "#00933C", fg: "#fff" },
  "5": { bg: "#00933C", fg: "#fff" },
  "6": { bg: "#00933C", fg: "#fff" },
  "7": { bg: "#B933AD", fg: "#fff" },
  S: { bg: "#808183", fg: "#fff" },
};

function isTargetHood(name: string): boolean {
  const lower = name.toLowerCase();
  return TARGET_HOOD_KEYWORDS.some((kw) => lower.includes(kw));
}

function shortHoodLabel(name: string): string {
  // Trim verbose NTA names like "SoHo-Little Italy-Hudson Square" -> "SoHo / Little Italy"
  const parts = name.split("-").map((s) => s.trim());
  if (parts.length <= 2) return name;
  return `${parts[0]} / ${parts[1]}`;
}

function pinColor(item: ScoredListing, isSelected: boolean): string {
  if (isSelected) return "#f59e0b";
  if (!item.passes_filters) return "#64748b";
  if (item.score >= 65) return "#10b981";
  if (item.score >= 50) return "#38bdf8";
  return "#a78bfa";
}

function formatShortMonthly(val: number): string {
  return `$${(val / 1000).toFixed(1)}k`;
}

function renderMtaBadges(routes: string[]): string {
  return routes
    .map((r) => {
      const c = MTA_COLORS[r] || { bg: "#64748b", fg: "#fff" };
      return `<span style="
        display:inline-flex;align-items:center;justify-content:center;
        width:17px;height:17px;border-radius:9999px;
        background:${c.bg};color:${c.fg};
        font-size:10px;font-weight:800;margin-right:3px;
      ">${r}</span>`;
    })
    .join("");
}

export function NycMap({ listings, selectedId, onSelect }: NycMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileGroupRef = useRef<L.LayerGroup | null>(null);
  const hoodLayerRef = useRef<L.LayerGroup | null>(null);
  const subwayLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const [style, setStyle] = useState<BasemapStyle>("dark");
  const [showHoods, setShowHoods] = useState(true);
  const [showSubways, setShowSubways] = useState(true);
  const [hoodGeo, setHoodGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [subways, setSubways] = useState<SubwayStation[]>([]);

  // Fetch local static NYC Open Data overlays once
  useEffect(() => {
    fetch("/data/nyc_neighborhoods.geojson?v=2")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setHoodGeo(d);
      })
      .catch(() => { });

    fetch("/data/nyc_subways.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setSubways(d);
      })
      .catch(() => { });
  }, []);

  // Init Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [40.722, -73.975],
      zoom: 12,
      zoomControl: true,
    });

    tileGroupRef.current = L.layerGroup().addTo(map);
    hoodLayerRef.current = L.layerGroup().addTo(map);
    subwayLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileGroupRef.current = null;
      hoodLayerRef.current = null;
      subwayLayerRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  // Basemap tiles
  useEffect(() => {
    const group = tileGroupRef.current;
    if (!group) return;
    group.clearLayers();
    const cfg = BASEMAPS[style];
    for (const url of cfg.urls) {
      L.tileLayer(url, {
        attribution: cfg.attribution,
        maxZoom: 16,
      }).addTo(group);
    }
  }, [style]);

  // Neighborhood boundaries + labels overlay
  useEffect(() => {
    const group = hoodLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showHoods || !hoodGeo) return;

    L.geoJSON(hoodGeo, {
      style: (feature) => {
        const name = String(feature?.properties?.name || "");
        const target = isTargetHood(name);
        return {
          color: target ? "#10b981" : "#475569",
          weight: target ? 1.4 : 0.7,
          opacity: target ? 0.65 : 0.35,
          fillColor: target ? "#10b981" : "#334155",
          fillOpacity: target ? 0.09 : 0.02,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = String(feature?.properties?.name || "");
        const target = isTargetHood(name);
        if (target && name) {
          layer.bindTooltip(shortHoodLabel(name), {
            permanent: true,
            direction: "center",
            className: "hood-label hood-label-target",
          });
        } else if (name) {
          layer.bindTooltip(name, {
            sticky: true,
            direction: "top",
            className: "hood-tooltip",
          });
        }
      },
    }).addTo(group);
  }, [showHoods, hoodGeo]);

  // MTA Subway stations overlay
  useEffect(() => {
    const group = subwayLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showSubways || subways.length === 0) return;

    for (const st of subways) {
      const primaryRoute = st.routes[0] || "";
      const color = (MTA_COLORS[primaryRoute] || { bg: "#94a3b8" }).bg;
      const dot = L.circleMarker([st.lat, st.lng], {
        radius: 4,
        color: "#020617",
        weight: 1.2,
        fillColor: color,
        fillOpacity: 0.9,
      });
      dot.bindTooltip(
        `<div style="font-size:12px">
          <div style="font-weight:700;margin-bottom:3px">🚇 ${st.name}</div>
          <div>${renderMtaBadges(st.routes)}</div>
        </div>`,
        { direction: "top", offset: [0, -6] }
      );
      dot.addTo(group);
    }
  }, [showSubways, subways]);

  // Apartment listing markers
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    for (const item of listings) {
      const { latitude, longitude } = item.listing;
      if (latitude == null || longitude == null) continue;

      const isSelected = item.id === selectedId;
      const bg = pinColor(item, isSelected);
      const scale = isSelected ? "scale(1.18)" : "scale(1)";
      const zIndex = isSelected ? 1000 : item.passes_filters ? Math.round(item.score * 5) : 10;
      const shownMonthly =
        item.costs.rentable_units > 0 ? item.costs.net_monthly_cost : item.costs.total_monthly_cost;

      const icon = L.divIcon({
        className: "house-pin",
        html: `<div style="
          background:${bg};
          color:#020617;
          font-weight:700;
          font-size:11px;
          padding:3px 7px;
          border-radius:9999px;
          border:2px solid ${isSelected ? "#ffffff" : "rgba(15,23,42,0.85)"};
          box-shadow:0 3px 10px rgba(0,0,0,0.45);
          white-space:nowrap;
          transform:${scale};
          transition:transform 120ms ease;
        ">${item.costs.rentable_units > 0 ? `${item.costs.num_units}U ` : ""}${formatShortMonthly(shownMonthly)}</div>`,
        iconSize: [58, 24],
        iconAnchor: [29, 12],
      });

      const marker = L.marker([latitude, longitude], { icon, zIndexOffset: zIndex });
      const unitStr = item.listing.unit ? ` #${item.listing.unit}` : "";
      const hood = item.listing.neighborhood || item.listing.borough || "NYC";
      const dti = item.costs.dti_pct != null ? ` • ${item.costs.dti_pct}% DTI` : "";

      marker.bindTooltip(
        `<div style="font-size:12px"><strong>${item.listing.address}${unitStr}</strong><br/>${hood} • $${Math.round(
          shownMonthly
        ).toLocaleString()}/mo${dti} • Score ${item.score}</div>`,
        { direction: "top", offset: [0, -10] }
      );

      marker.on("click", () => onSelect(item));
      marker.addTo(layer);
    }
  }, [listings, selectedId, onSelect]);

  // Fly to selected listing
  useEffect(() => {
    if (!selectedId || !mapRef.current) return;
    const target = listings.find((l) => l.id === selectedId);
    if (target?.listing.latitude != null && target?.listing.longitude != null) {
      mapRef.current.flyTo([target.listing.latitude, target.listing.longitude], Math.max(mapRef.current.getZoom(), 14), {
        duration: 0.55,
      });
    }
  }, [selectedId, listings]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-800">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Right Controls: Overlays + Basemap Switcher */}
      <div className="absolute right-3 top-3 z-[400] flex flex-wrap items-center justify-end gap-1.5">
        <button
          onClick={() => setShowHoods((v) => !v)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium backdrop-blur transition ${showHoods
            ? "border-emerald-500/60 bg-emerald-950/85 text-emerald-300"
            : "border-slate-700/80 bg-slate-950/85 text-slate-400 hover:text-slate-200"
            }`}
        >
          <Layers className="h-3 w-3" /> Neighborhoods
        </button>

        <button
          onClick={() => setShowSubways((v) => !v)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium backdrop-blur transition ${showSubways
            ? "border-sky-500/60 bg-sky-950/85 text-sky-300"
            : "border-slate-700/80 bg-slate-950/85 text-slate-400 hover:text-slate-200"
            }`}
        >
          <TrainFront className="h-3 w-3" /> Subways
        </button>

        <div className="flex rounded-lg border border-slate-700/80 bg-slate-950/90 p-0.5 text-[11px] backdrop-blur">
          {(Object.keys(BASEMAPS) as BasemapStyle[]).map((key) => (
            <button
              key={key}
              onClick={() => setStyle(key)}
              className={`rounded-md px-2 py-1 font-medium transition ${style === key
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              {BASEMAPS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex items-center gap-3 rounded-lg border border-slate-700/80 bg-slate-950/90 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Top (≥65)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Good (50–64)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-400" /> Match (&lt;50)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Rejected
        </span>
      </div>
    </div>
  );
}
