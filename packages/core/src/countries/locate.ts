/**
 * locate(lat, lon): which jurisdiction a point is in, how it is covered, and its nearest stations —
 * always from that jurisdiction only (REGIONAL §3.5: "the jurisdiction follows the reading, never interpolate
 * official values across a border"). A Woodlands user gets NEA, a Johor Bahru user gets DOE, even though the
 * other country's station may be closer.
 */
import { haversineKm } from "../math.js";
import { countryAt } from "./borders.js";
import { COUNTRIES } from "./registry.js";
import type { CountryCode, CoverageStatus, Observation, ObservationSet } from "./types.js";

export interface LocateResult {
  country: CountryCode | null;
  status: CoverageStatus | "outside";
  /** Preferred adapter id for this country, or null. */
  adapter: string | null;
  chipScale: string | null;
  /** Nearest observations from the same country only (empty if no set for it was given). */
  nearest: { observation: Observation; distanceKm: number }[];
  /** The nearest observation in ANY given set, when it is in another country (for an "also nearby" line only). */
  nearestAcrossBorder: { observation: Observation; distanceKm: number } | null;
}

export function locate(lat: number, lon: number, sets: readonly ObservationSet[] = [], n = 3): LocateResult {
  const country = countryAt(lat, lon);
  const point = { lat, lon };
  if (!country) {
    return { country: null, status: "outside", adapter: null, chipScale: null, nearest: [], nearestAcrossBorder: null };
  }
  const info = COUNTRIES[country];
  const all = sets.flatMap((s) => s.observations.map((o) => ({ observation: o, distanceKm: haversineKm(point, o) })));
  all.sort((a, b) => a.distanceKm - b.distanceKm);
  const same = all.filter((x) => x.observation.country === country);
  const other = all.find((x) => x.observation.country !== country) ?? null;
  return {
    country,
    status: info.status,
    adapter: info.adapters[0] ?? null,
    chipScale: info.chipScale,
    nearest: same.slice(0, n),
    nearestAcrossBorder: other && (!same[0] || other.distanceKm < same[0].distanceKm) ? other : null,
  };
}
