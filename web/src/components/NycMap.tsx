import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Layers, Map as MapIcon, TrainFront } from "lucide-react";
import { MAP_CONFIG, MTA_COLORS, SCORE_TIERS, type BasemapStyle } from "../config";
import type { ScoredListing } from "../types";
import {
  createBuildingUnitsPopupElement,
  createClusterPinElement,
  createClusterTooltipElement,
  createListingPinElement,
  createListingTooltipElement,
  createSubwayPopupElement,
} from "./mapDom";

interface NycMapProps {
  listings: ScoredListing[];
  selectedId: number | null;
  onSelect: (item: ScoredListing) => void;
  theme?: "dark" | "light";
  targetNeighborhoods?: string[];
}

interface SubwayStation {
  name: string;
  routes: string[];
  borough: string;
  lat: number;
  lng: number;
}

function shortHoodLabel(name: string): string {
  const parts = name.split("-").map((s) => s.trim());
  if (parts.length <= 2) return name;
  return `${parts[0]} / ${parts[1]}`;
}

export function NycMap({
  listings,
  selectedId,
  onSelect,
  theme = "dark",
  targetNeighborhoods = [],
}: NycMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileGroupRef = useRef<L.LayerGroup | null>(null);
  const hoodLayerRef = useRef<L.LayerGroup | null>(null);
  const subwayLineLayerRef = useRef<L.LayerGroup | null>(null);
  const subwayLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  const [showStreets, setShowStreets] = useState(false);
  const [showHoods, setShowHoods] = useState(true);
  const [showSubways, setShowSubways] = useState(true);
  const [zoom, setZoom] = useState<number>(MAP_CONFIG.initialZoom);
  const [hoodGeo, setHoodGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [subwayLinesGeo, setSubwayLinesGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const [subways, setSubways] = useState<SubwayStation[]>([]);

  const style: BasemapStyle = showStreets ? "streets" : theme;

  const targetKeywords = useMemo(
    () => targetNeighborhoods.map((n) => n.trim().toLowerCase()).filter(Boolean),
    [targetNeighborhoods]
  );

  const isTargetHood = (name: string): boolean => {
    const lower = name.toLowerCase();
    return targetKeywords.some((kw) => lower.includes(kw) || kw.includes(lower));
  };

  useEffect(() => {
    fetch(MAP_CONFIG.dataUrls.neighborhoods)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setHoodGeo(d);
      })
      .catch(() => {});

    fetch(MAP_CONFIG.dataUrls.subwayLines)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setSubwayLinesGeo(d);
      })
      .catch(() => {});

    fetch(MAP_CONFIG.dataUrls.subways)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setSubways(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: MAP_CONFIG.initialCenter,
      zoom: MAP_CONFIG.initialZoom,
      zoomControl: false,
    });

    const subwayLinePane = map.createPane("subwayLinePane");
    subwayLinePane.style.zIndex = "520";
    subwayLinePane.style.pointerEvents = "none";

    const subwayPane = map.createPane("subwayPane");
    subwayPane.style.zIndex = "550";

    tileGroupRef.current = L.layerGroup().addTo(map);
    hoodLayerRef.current = L.layerGroup().addTo(map);
    subwayLineLayerRef.current = L.layerGroup().addTo(map);
    subwayLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);

    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(containerRef.current);

    return () => {
      map.off("zoomend", onZoom);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileGroupRef.current = null;
      hoodLayerRef.current = null;
      subwayLineLayerRef.current = null;
      subwayLayerRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = tileGroupRef.current;
    if (!group) return;
    group.clearLayers();
    const cfg = MAP_CONFIG.basemaps[style];
    for (const url of cfg.urls) {
      L.tileLayer(url, {
        attribution: cfg.attribution,
        maxZoom: MAP_CONFIG.maxTileZoom,
      }).addTo(group);
    }
  }, [style]);

  // Neighborhood boundaries + labels (permanent labels hidden when zoomed out)
  useEffect(() => {
    const group = hoodLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showHoods || !hoodGeo) return;

    const showPermanentLabels = zoom >= MAP_CONFIG.zoomThresholds.showPermanentHoodLabels;

    L.geoJSON(hoodGeo, {
      style: (feature) => {
        const name = String(feature?.properties?.name || "");
        const target = isTargetHood(name);
        return {
          color: target ? "#60a5fa" : "#3f3f46",
          weight: target ? 1.2 : 0.7,
          opacity: target ? 0.5 : 0.28,
          fillColor: target ? "#3b82f6" : "#27272a",
          fillOpacity: target ? 0.06 : 0.015,
        };
      },
      onEachFeature: (feature, layer) => {
        const name = String(feature?.properties?.name || "");
        if (!name) return;
        const target = isTargetHood(name);
        if (target && showPermanentLabels) {
          layer.bindTooltip(shortHoodLabel(name), {
            permanent: true,
            direction: "center",
            className: "hood-label hood-label-target",
          });
        } else {
          layer.bindTooltip(name, {
            sticky: true,
            direction: "top",
            className: "hood-tooltip",
          });
        }
      },
    }).addTo(group);
  }, [showHoods, hoodGeo, zoom, targetKeywords]);

  // MTA Subway & PATH track lines
  useEffect(() => {
    const group = subwayLineLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showSubways || !subwayLinesGeo) return;

    L.geoJSON(subwayLinesGeo, {
      pane: "subwayLinePane",
      interactive: false,
      style: (feature) => {
        const rt = String(feature?.properties?.route || "");
        const color = (MTA_COLORS[rt] || { bg: "#94a3b8" }).bg;
        const zoomedOut = zoom < MAP_CONFIG.zoomThresholds.showSubwayDots;
        return {
          color,
          weight: zoomedOut ? 1.8 : 2.4,
          opacity: zoomedOut ? 0.45 : 0.62,
        };
      },
    }).addTo(group);
  }, [showSubways, subwayLinesGeo, zoom]);

  // MTA Subway & PATH station dots (hidden when zoomed far out)
  useEffect(() => {
    const group = subwayLayerRef.current;
    if (!group) return;
    group.clearLayers();
    if (!showSubways || subways.length === 0 || zoom < MAP_CONFIG.zoomThresholds.showSubwayDots) return;

    const canHover = window.matchMedia("(hover: hover)").matches;
    for (const st of subways) {
      const primaryRoute = st.routes[0] || "";
      const color = (MTA_COLORS[primaryRoute] || { bg: "#94a3b8" }).bg;
      const dot = L.circleMarker([st.lat, st.lng], {
        pane: "subwayPane",
        radius: 5,
        color: "#020617",
        weight: 1.4,
        fillColor: color,
        fillOpacity: 0.92,
      });
      dot.bindPopup(() => createSubwayPopupElement(st.name, st.routes), {
        closeButton: false,
        offset: [0, -4],
      });
      if (canHover) {
        dot.bindTooltip(() => createSubwayPopupElement(st.name, st.routes), {
          direction: "top",
          offset: [0, -6],
        });
        dot.on("popupopen", () => dot.closeTooltip());
      }
      dot.addTo(group);
    }
  }, [showSubways, subways, zoom]);

  // Apartment listing markers with progressive zoom-based clustering
  useEffect(() => {
    const layer = markerLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;

    layer.clearLayers();

    const withCoords = listings.filter(
      (item) => item.listing.latitude != null && item.listing.longitude != null
    );

    const addSingleMarker = (item: ScoredListing) => {
      const isSelected = item.id === selectedId;
      const zIndex = isSelected ? 1000 : item.passes_filters ? Math.round(item.score * 5) : 10;
      const isMulti = item.costs.rentable_units > 0;
      const pinWidth = isMulti ? MAP_CONFIG.pinSizes.multiUnitWidth : MAP_CONFIG.pinSizes.singleWidth;
      const pinHeight = MAP_CONFIG.pinSizes.height;
      const icon = L.divIcon({
        className: "house-pin",
        html: createListingPinElement(item, isSelected),
        iconSize: [pinWidth, pinHeight],
        iconAnchor: [pinWidth / 2, pinHeight / 2],
      });
      const marker = L.marker([item.listing.latitude!, item.listing.longitude!], {
        icon,
        zIndexOffset: zIndex,
      });
      marker.bindTooltip(() => createListingTooltipElement(item), {
        direction: "top",
        offset: [0, -10],
      });
      marker.on("click", () => onSelect(item));
      marker.addTo(layer);
    };

    const canHover = window.matchMedia("(hover: hover)").matches;

    const addBuildingMarker = (group: ScoredListing[]) => {
      const sorted = [...group].sort((a, b) => b.score - a.score);
      const hasSelected = sorted.some((i) => i.id === selectedId);
      const minMonthly = Math.min(
        ...sorted.map((i) =>
          i.costs.rentable_units > 0 ? i.costs.net_monthly_cost : i.costs.total_monthly_cost
        )
      );
      const topScore = Math.max(...sorted.map((i) => i.score));
      const accent =
        topScore >= SCORE_TIERS.topMin
          ? SCORE_TIERS.colors.top.bg
          : topScore >= SCORE_TIERS.goodMin
          ? SCORE_TIERS.colors.good.bg
          : SCORE_TIERS.colors.match.bg;

      const { pillClusterWidth: pW, pillClusterHeight: pH } = MAP_CONFIG.pinSizes;
      const icon = L.divIcon({
        className: "house-pin",
        html: createClusterPinElement(sorted.length, minMonthly, accent, false, hasSelected),
        iconSize: [pW, pH],
        iconAnchor: [pW / 2, pH / 2],
      });

      const marker = L.marker([sorted[0].listing.latitude!, sorted[0].listing.longitude!], {
        icon,
        zIndexOffset: hasSelected ? 1000 : 350 + sorted.length,
      });

      marker.bindPopup(
        () =>
          createBuildingUnitsPopupElement(sorted, selectedId, (chosen) => {
            marker.closePopup();
            onSelect(chosen);
          }),
        {
          closeButton: true,
          offset: [0, -8],
          maxWidth: 300,
        }
      );

      if (canHover) {
        marker.bindTooltip(() => createClusterTooltipElement(sorted.length, minMonthly, topScore), {
          direction: "top",
          offset: [0, -10],
        });
        marker.on("popupopen", () => marker.closeTooltip());
      }
      marker.addTo(layer);
    };

    if (zoom >= MAP_CONFIG.zoomThresholds.unclusterMinZoom) {
      const byBuilding = new Map<string, ScoredListing[]>();
      for (const item of withCoords) {
        const key = `${item.listing.latitude!.toFixed(5)},${item.listing.longitude!.toFixed(5)}`;
        const arr = byBuilding.get(key) || [];
        arr.push(item);
        byBuilding.set(key, arr);
      }
      for (const group of byBuilding.values()) {
        if (group.length === 1) {
          addSingleMarker(group[0]);
        } else {
          addBuildingMarker(group);
        }
      }
      return;
    }

    const { z10OrLess, z11, z12, z13 } = MAP_CONFIG.clusterCellPx;
    const cellPx = zoom <= 10 ? z10OrLess : zoom === 11 ? z11 : zoom === 12 ? z12 : z13;
    const compactCluster = zoom <= MAP_CONFIG.zoomThresholds.compactClustersMaxZoom;
    const buckets = new Map<string, ScoredListing[]>();

    for (const item of withCoords) {
      if (item.id === selectedId) {
        addSingleMarker(item);
        continue;
      }
      const pt = map.project([item.listing.latitude!, item.listing.longitude!], zoom);
      const key = `${Math.floor(pt.x / cellPx)}:${Math.floor(pt.y / cellPx)}`;
      const arr = buckets.get(key) || [];
      arr.push(item);
      buckets.set(key, arr);
    }

    for (const group of buckets.values()) {
      if (group.length === 1 && !compactCluster) {
        addSingleMarker(group[0]);
        continue;
      }
      const avgLat = group.reduce((s, i) => s + i.listing.latitude!, 0) / group.length;
      const avgLng = group.reduce((s, i) => s + i.listing.longitude!, 0) / group.length;
      const minMonthly = Math.min(
        ...group.map((i) =>
          i.costs.rentable_units > 0 ? i.costs.net_monthly_cost : i.costs.total_monthly_cost
        )
      );
      const topScore = Math.max(...group.map((i) => i.score));
      const accent =
        topScore >= SCORE_TIERS.topMin
          ? SCORE_TIERS.colors.top.bg
          : topScore >= SCORE_TIERS.goodMin
          ? SCORE_TIERS.colors.good.bg
          : SCORE_TIERS.colors.match.bg;

      const { compactCluster: cSize, pillClusterWidth: pW, pillClusterHeight: pH } = MAP_CONFIG.pinSizes;
      const clusterIcon = L.divIcon({
        className: "house-pin",
        html: createClusterPinElement(group.length, minMonthly, accent, compactCluster),
        iconSize: compactCluster ? [cSize, cSize] : [pW, pH],
        iconAnchor: compactCluster ? [cSize / 2, cSize / 2] : [pW / 2, pH / 2],
      });

      const marker = L.marker([avgLat, avgLng], {
        icon: clusterIcon,
        zIndexOffset: 200 + group.length,
      });
      marker.bindTooltip(() => createClusterTooltipElement(group.length, minMonthly, topScore), {
        direction: "top",
        offset: [0, -10],
      });
      marker.on("click", () => {
        if (group.length === 1) {
          onSelect(group[0]);
          return;
        }
        const bounds = L.latLngBounds(
          group.map((i) => [i.listing.latitude!, i.listing.longitude!] as [number, number])
        );
        map.flyToBounds(bounds.pad(0.25), { maxZoom: Math.max(zoom + 2, 15), duration: 0.45 });
      });
      marker.addTo(layer);
    }
  }, [listings, selectedId, onSelect, zoom]);

  const lastFlownIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedId || !mapRef.current) {
      lastFlownIdRef.current = null;
      return;
    }
    if (lastFlownIdRef.current === selectedId) return;
    const target = listings.find((l) => l.id === selectedId);
    if (target?.listing.latitude != null && target?.listing.longitude != null) {
      lastFlownIdRef.current = selectedId;
      mapRef.current.flyTo(
        [target.listing.latitude, target.listing.longitude],
        Math.max(mapRef.current.getZoom(), MAP_CONFIG.flyToListingMinZoom),
        { duration: 0.45 }
      );
    }
  }, [selectedId, listings]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-zinc-800">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Right Controls */}
      <div className="absolute right-3 top-3 z-[400] flex flex-wrap items-center justify-end gap-1.5">
        <button
          onClick={() => setShowHoods((v) => !v)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium backdrop-blur transition ${
            showHoods
              ? "border-blue-500/50 bg-zinc-900/90 text-blue-300"
              : "border-zinc-800 bg-zinc-950/85 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Layers className="h-3 w-3" /> Neighborhoods
        </button>

        <button
          onClick={() => setShowSubways((v) => !v)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium backdrop-blur transition ${
            showSubways
              ? "border-blue-500/50 bg-zinc-900/90 text-blue-300"
              : "border-zinc-800 bg-zinc-950/85 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <TrainFront className="h-3 w-3" /> Subways
        </button>

        <button
          onClick={() => setShowStreets((v) => !v)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium backdrop-blur transition ${
            showStreets
              ? "border-blue-500/50 bg-zinc-900/90 text-blue-300"
              : "border-zinc-800 bg-zinc-950/85 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <MapIcon className="h-3 w-3" /> Streets
        </button>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] hidden items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/90 px-3 py-1.5 text-[11px] text-zinc-400 backdrop-blur sm:flex">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-400" /> Top (≥{SCORE_TIERS.topMin})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Good ({SCORE_TIERS.goodMin}–{SCORE_TIERS.topMin - 1})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" /> Match (&lt;{SCORE_TIERS.goodMin})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" /> Rejected
        </span>
      </div>
    </div>
  );
}
