import type { KnobsState } from "./types";

export const PROPERTY_TYPES = [
  "condo",
  "coop",
  "condop",
  "townhouse",
  "multifamily",
] as const;

export const DEFAULT_KNOBS: KnobsState = {
  annual_income: 300000,
  max_monthly_cost: 7000,
  max_price: 2000000,
  down_payment_pct: 20,
  interest_rate_pct: 6.5,
  loan_term_years: 30,
  use_after_tax_for_filter: false,
  est_rent_per_unit: 3200,
  use_net_rental_for_filter: true,
  current_monthly_rent: 5300,
  hold_years: 7,
  home_appreciation_pct: 3.0,
  rent_growth_pct: 3.5,
  investment_return_pct: 7.0,
  min_units: 1,
  min_beds: 1,
  min_sqft: 600,
  max_commute_minutes: 0,
  nj_max_walk_to_path_min: 15,
  property_types: [...PROPERTY_TYPES],
  exclude_hdfc: true,
  exclude_land_lease: false,
  show_rejected: false,
  search_query: "",
};

export const UI_CONFIG = {
  themeStorageKey: "house-theme",
  desktopBreakpointPx: 1024,
  rankDebounceMs: 120,
  hoverTipDelayMs: 100,
  maxCompareItems: 3,
  leftSidebar: { defaultWidth: 288, minWidth: 240, maxWidth: 520 },
  rightPanel: { defaultWidth: 400, minWidth: 240, maxViewportRatio: 0.65 },
  drawer: { defaultWidth: 460, minWidth: 360, expandedBreakpoint: 680, expandedTarget: 760 },
} as const;

export const SCORE_TIERS = {
  topMin: 65,
  goodMin: 50,
  colors: {
    selected: { bg: "#fafafa", fg: "#09090b" },
    rejected: { bg: "#3f3f46", fg: "#d4d4d8" },
    top: { bg: "#2dd4bf", fg: "#09090b" },
    good: { bg: "#60a5fa", fg: "#09090b" },
    match: { bg: "#a1a1aa", fg: "#09090b" },
  },
} as const;

export type BasemapStyle = "dark" | "light" | "streets";

export const MAP_CONFIG = {
  initialCenter: [40.722, -73.975] as [number, number],
  initialZoom: 12,
  maxTileZoom: 16,
  flyToListingMinZoom: 14,
  dataUrls: {
    neighborhoods: "/data/nyc_neighborhoods.geojson?v=2",
    subwayLines: "/data/nyc_subway_lines.geojson",
    subways: "/data/nyc_subways.json",
  },
  zoomThresholds: {
    showPermanentHoodLabels: 12,
    showSubwayDots: 12,
    compactClustersMaxZoom: 11,
    unclusterMinZoom: 14,
  },
  clusterCellPx: {
    z10OrLess: 110,
    z11: 90,
    z12: 76,
    z13: 56,
  },
  pinSizes: {
    singleWidth: 62,
    multiUnitWidth: 82,
    height: 24,
    compactCluster: 30,
    pillClusterWidth: 86,
    pillClusterHeight: 26,
  },
  basemaps: {
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
  } as Record<BasemapStyle, { label: string; urls: string[]; attribution: string }>,
} as const;

export const MTA_COLORS: Record<string, { bg: string; fg: string }> = {
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
  PATH: { bg: "#0078C8", fg: "#fff" },
};
