import { useEffect, useRef } from "react";
import L from "leaflet";
import type { ScoredListing } from "../types";

interface NycMapProps {
  listings: ScoredListing[];
  selectedId: number | null;
  onSelect: (item: ScoredListing) => void;
}

function pinColor(item: ScoredListing, isSelected: boolean): string {
  if (isSelected) return "#f59e0b"; // Amber highlight
  if (!item.passes_filters) return "#64748b"; // Slate rejected
  if (item.score >= 65) return "#10b981"; // Emerald top match
  if (item.score >= 50) return "#38bdf8"; // Sky solid match
  return "#a78bfa"; // Violet stretch
}

function formatShortMonthly(val: number): string {
  return `$${(val / 1000).toFixed(1)}k`;
}

export function NycMap({ listings, selectedId, onSelect }: NycMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [40.722, -73.975], // Lower Manhattan / Williamsburg / DUMBO / LIC
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    layer.clearLayers();
    markersRef.current.clear();

    for (const item of listings) {
      const { latitude, longitude } = item.listing;
      if (latitude == null || longitude == null) continue;

      const isSelected = item.id === selectedId;
      const bg = pinColor(item, isSelected);
      const scale = isSelected ? "scale(1.18)" : "scale(1)";
      const zIndex = isSelected ? 1000 : item.passes_filters ? Math.round(item.score * 5) : 10;

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
          box-shadow:0 3px 10px rgba(0,0,0,0.5);
          white-space:nowrap;
          transform:${scale};
          transition:transform 120ms ease;
        ">${formatShortMonthly(item.costs.total_monthly_cost)}</div>`,
        iconSize: [52, 24],
        iconAnchor: [26, 12],
      });

      const marker = L.marker([latitude, longitude], { icon, zIndexOffset: zIndex });
      const unitStr = item.listing.unit ? ` #${item.listing.unit}` : "";
      const hood = item.listing.neighborhood || item.listing.borough || "NYC";
      const dti = item.costs.dti_pct != null ? ` • ${item.costs.dti_pct}% DTI` : "";

      marker.bindTooltip(
        `<div style="font-size:12px"><strong>${item.listing.address}${unitStr}</strong><br/>${hood} • $${Math.round(
          item.costs.total_monthly_cost
        ).toLocaleString()}/mo${dti} • Score ${item.score}</div>`,
        { direction: "top", offset: [0, -10] }
      );

      marker.on("click", () => onSelect(item));
      marker.addTo(layer);
      markersRef.current.set(item.id, marker);
    }
  }, [listings, selectedId, onSelect]);

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
