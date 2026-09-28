/**
 * Pure, deterministic computations from SPEC §"Computation". No I/O, no clock.
 * Every client (Swift, Kotlin) must produce identical numbers for identical inputs.
 */
import {
  BANDS,
  DEFAULT_REGION,
  PM25_BREAKPOINTS,
  PSI_LABELS,
  SNAP_KM,
  TREND_THRESHOLD,
  type BandInfo,
} from "./constants.js";
import type { Band, LatLon, LocationMode, LocationQuery, PsiLabel, Trend } from "./types.js";

/** Round half up (88.5 → 89). Used everywhere a SPEC value is "rounded to integer". */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** -1, null, undefined, NaN and negatives mean "station offline". */
export function isValidReading(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/** Normalise a raw reading: invalid → null. */
export function cleanReading(v: unknown): number | null {
  return isValidReading(v) ? v : null;
}

/** NEA 1-hr PM2.5 band for a concentration in µg/m³. */
export function bandFor(pm25: number): Band {
  return bandInfo(pm25).band;
}

/** Full band metadata (label, colour, advice) for a concentration or a band id. */
export function bandInfo(pm25OrBand: number | Band): BandInfo {
  if (typeof pm25OrBand === "string") {
    return BANDS.find((b) => b.band === pm25OrBand) ?? BANDS[0];
  }
  const c = Math.max(0, pm25OrBand);
  // Bands are defined on integer µg/m³ (0–55, 56–150, ...); compare on the rounded value.
  const r = roundHalfUp(c);
  return BANDS.find((b) => r <= b.max) ?? BANDS[BANDS.length - 1];
}

/**
 * "Instant PSI": NEA PM2.5 sub-index applied to the 1-hr concentration.
 * Linear interpolation over the breakpoints, rounded half up, capped at 500.
 */
export function instantPsi(pm25: number): number {
  const c = Math.max(0, pm25);
  const last = PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];
  if (c >= last[1]) return last[3];
  for (const [clo, chi, ilo, ihi] of PM25_BREAKPOINTS) {
    if (c <= chi) {
      return Math.min(500, roundHalfUp(ilo + ((c - clo) * (ihi - ilo)) / (chi - clo)));
    }
  }
  return 500;
}

/** PSI descriptor: 0–50 Good, 51–100 Moderate, 101–200 Unhealthy, 201–300 Very Unhealthy, >300 Hazardous. */
export function psiLabel(psi: number): PsiLabel {
  const r = roundHalfUp(Math.max(0, psi));
  return (PSI_LABELS.find((l) => r <= l.max) ?? PSI_LABELS[PSI_LABELS.length - 1]).label;
}

/** Short NEA 1-hr guidance for a band or concentration. */
export function advice(pm25OrBand: number | Band): string {
  return bandInfo(pm25OrBand).advice;
}

/** Trend vs the previous hour. ▲ if delta ≥ +5, ▼ if ≤ −5, else steady. */
export function trend(latest: number, previous: number | null | undefined): Trend {
  if (!isValidReading(previous)) return { delta: 0, direction: "steady" };
  const delta = latest - previous;
  const direction = delta >= TREND_THRESHOLD ? "up" : delta <= -TREND_THRESHOLD ? "down" : "steady";
  return { delta, direction };
}

export const TREND_ARROWS = { up: "▲", down: "▼", steady: "▶" } as const;

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface IdwResult {
  /** rounded to integer */
  value: number;
  nearestRegion: string;
  /** distance to nearest valid region, km */
  nearestKm: number;
}

/**
 * Inverse-distance weighting (power 2, haversine km) over regions with a valid value.
 * If the nearest valid region is < 0.5 km away, its value is used directly.
 * Returns null if no region is valid.
 */
export function idw(
  values: Record<string, number | null | undefined>,
  coords: Record<string, LatLon>,
  point: LatLon,
): IdwResult | null {
  const pts: { name: string; v: number; d: number }[] = [];
  for (const name of Object.keys(coords)) {
    const v = values[name];
    if (!isValidReading(v)) continue;
    pts.push({ name, v, d: haversineKm(point, coords[name]) });
  }
  if (pts.length === 0) return null;
  pts.sort((a, b) => a.d - b.d);
  const nearest = pts[0];
  if (nearest.d < SNAP_KM) {
    return { value: roundHalfUp(nearest.v), nearestRegion: nearest.name, nearestKm: nearest.d };
  }
  let num = 0;
  let den = 0;
  for (const p of pts) {
    const w = 1 / (p.d * p.d);
    num += w * p.v;
    den += w;
  }
  return { value: roundHalfUp(num / den), nearestRegion: nearest.name, nearestKm: nearest.d };
}

/** Mean of valid values, rounded half up; null if none are valid. */
export function islandMean(values: Record<string, number | null | undefined>): number | null {
  const valid = Object.values(values).filter(isValidReading);
  if (valid.length === 0) return null;
  return roundHalfUp(valid.reduce((s, v) => s + v, 0) / valid.length);
}

export interface LocateResult {
  value: number | null;
  locationMode: LocationMode;
  nearestRegion: string;
}

export function hasCoords(q: LocationQuery): q is LocationQuery & LatLon {
  return (
    typeof q.lat === "number" &&
    typeof q.lon === "number" &&
    Number.isFinite(q.lat) &&
    Number.isFinite(q.lon)
  );
}

/**
 * Reading "at your spot" (SPEC §1).
 * - lat/lon known → IDW (mode "gps").
 * - otherwise selected region (default central) (mode "region"); region "island" → island mean (mode "island");
 *   if that region is invalid → mean of valid regions (mode "island").
 */
export function locate(
  values: Record<string, number | null | undefined>,
  coords: Record<string, LatLon>,
  query: LocationQuery = {},
): LocateResult {
  if (hasCoords(query)) {
    const r = idw(values, coords, { lat: query.lat, lon: query.lon });
    if (r) return { value: r.value, locationMode: "gps", nearestRegion: r.nearestRegion };
    return {
      value: null,
      locationMode: "gps",
      nearestRegion: nearestRegionAny(coords, { lat: query.lat, lon: query.lon }) ?? DEFAULT_REGION,
    };
  }
  const region = normaliseRegion(query.region);
  if (region === "island") {
    // Explicit island view (SPEC v1.4 §3 fallback): mean of online stations, no station named.
    const spatial: Record<string, number | null | undefined> = {};
    for (const k of Object.keys(coords)) spatial[k] = values[k];
    return { value: islandMean(spatial), locationMode: "island", nearestRegion: "" };
  }
  const v = values[region];
  if (isValidReading(v)) return { value: roundHalfUp(v), locationMode: "region", nearestRegion: region };
  // Island mean over the spatial regions only (v1 PSI data can carry a "national" key).
  const spatial: Record<string, number | null | undefined> = {};
  for (const k of Object.keys(coords)) spatial[k] = values[k];
  return { value: islandMean(spatial), locationMode: "island", nearestRegion: region };
}

export function normaliseRegion(region: string | undefined | null): string {
  const r = (region ?? "").trim().toLowerCase();
  return r || DEFAULT_REGION;
}

/** Nearest region by distance regardless of validity. */
export function nearestRegionAny(coords: Record<string, LatLon>, point: LatLon): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const [name, c] of Object.entries(coords)) {
    const d = haversineKm(point, c);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
