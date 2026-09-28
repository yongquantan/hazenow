import type { Band, LatLon, PsiLabel } from "./types.js";

export const SOURCE = "NEA via data.gov.sg" as const;
/** v2: back-fills gaps; rate-limited (SPEC v1.3). */
export const API_BASE = "https://api-open.data.gov.sg/v2/real-time/api";
/** v1: first-publish stamps ~1 min after the hour; primary for freshness (SPEC v1.3). */
export const API_V1_BASE = "https://api.data.gov.sg/v1/environment";

/** Fallback coordinates only; always prefer `regionMetadata` from the API response. */
export const REGION_COORDS: Record<string, LatLon> = {
  north: { lat: 1.41803, lon: 103.82 },
  south: { lat: 1.29587, lon: 103.82 },
  east: { lat: 1.35735, lon: 103.94 },
  west: { lat: 1.35735, lon: 103.7 },
  central: { lat: 1.35735, lon: 103.82 },
};

export const REGION_ORDER = ["north", "west", "central", "east", "south"] as const;
export const DEFAULT_REGION = "central";

export interface BandInfo {
  band: Band;
  numeral: "I" | "II" | "III" | "IV";
  label: string;
  color: string;
  /** Non-colour cue so bands are never colour-only (COPY §3: circle, circle-with-bar, triangle, octagon). */
  shape: "circle" | "half" | "triangle" | "octagon";
  /** Text glyph for the shape, for terminals / plain text. */
  glyph: string;
  min: number;
  /** inclusive upper bound, Infinity for the last band */
  max: number;
  advice: string;
}

export const BANDS: readonly BandInfo[] = [
  {
    band: "normal",
    numeral: "I",
    label: "Normal",
    color: "#2E9E5B",
    shape: "circle",
    glyph: "●",
    min: 0,
    max: 55,
    advice: "Normal activities.",
  },
  {
    band: "elevated",
    numeral: "II",
    label: "Elevated",
    color: "#E8A317",
    shape: "half",
    glyph: "◐",
    min: 56,
    max: 150,
    advice:
      "Consider reducing prolonged or strenuous outdoor exertion. Elderly, kids, heart/lung conditions: minimise outdoor exertion.",
  },
  {
    band: "high",
    numeral: "III",
    label: "High",
    color: "#E4572E",
    shape: "triangle",
    glyph: "△",
    min: 151,
    max: 250,
    advice: "Reduce outdoor exertion. Sensitive groups: avoid it. Close windows.",
  },
  {
    band: "very_high",
    numeral: "IV",
    label: "Very High",
    color: "#7B2D8E",
    shape: "octagon",
    glyph: "⯃",
    min: 251,
    max: Infinity,
    advice: "Avoid outdoor activity. Stay indoors, windows shut, use an air purifier.",
  },
];

/** NEA PM2.5 sub-index breakpoints: [C_lo, C_hi, I_lo, I_hi] */
export const PM25_BREAKPOINTS: readonly (readonly [number, number, number, number])[] = [
  [0, 12, 0, 50],
  [12, 55, 50, 100],
  [55, 150, 100, 200],
  [150, 250, 200, 300],
  [250, 350, 300, 400],
  [350, 500, 400, 500],
];

export const PSI_LABELS: readonly { max: number; label: PsiLabel }[] = [
  { max: 50, label: "Good" },
  { max: 100, label: "Moderate" },
  { max: 200, label: "Unhealthy" },
  { max: 300, label: "Very Unhealthy" },
  { max: Infinity, label: "Hazardous" },
];

/** observedAt older than this => stale (SPEC §7). */
export const STALE_AFTER_MS = (2 * 60 + 15) * 60 * 1000;
/** Within this distance of a region's label point, just use that region (SPEC §3.1). */
export const SNAP_KM = 0.5;
export const TREND_THRESHOLD = 5;
export const HISTORY_HOURS = 24;

/** Typical clear-day 1-hr PM2.5 in Singapore when <7 days of history are available (SPEC v1.1 §6). */
export const TYPICAL_PM25 = 20;
/** Show a range when the nearest valid station is further than this (km)… */
export const UNCERTAIN_KM = 5;
/** …or when the two nearest valid stations differ by more than this many µg/m³. */
export const DISAGREE_UGM3 = 30;
