/**
 * The few country facts the Singapore page needs up front, with no dependency on the SEA catalogue or border data
 * (those live in country.ts and load on demand, so Singapore users don't download them).
 */
import type { LatLon } from "hazenow";

type CountryCode = import("hazenow").sea.CountryCode;

/** How a country is covered: direct from the authority, through the HazeNow server, or not yet (sea.COUNTRIES status). */
export type LiteCoverage = "direct" | "proxy" | "none";

/** Picker order, names and coverage (mirrors sea.PICKER_COUNTRIES / sea.COUNTRIES; checked by country.ts at load). */
export const PICKER_LITE: readonly [CountryCode, string, LiteCoverage][] = [
  ["SG", "Singapore", "direct"],
  ["TH", "Thailand", "direct"],
  ["MY", "Malaysia", "proxy"],
  ["ID", "Indonesia", "proxy"],
  ["VN", "Vietnam", "proxy"],
  ["PH", "Philippines", "proxy"],
  ["LA", "Laos", "proxy"],
  ["KH", "Cambodia", "none"],
  ["MM", "Myanmar", "none"],
  ["BN", "Brunei", "none"],
  ["TL", "Timor-Leste", "none"],
];

/**
 * A box that is Singapore and nothing else (it stops short of the Johor Strait and of Batam). Points inside skip the
 * border lookup; anything outside loads country.ts and asks locate().
 */
export function surelySingapore(p: LatLon): boolean {
  return p.lat >= 1.2 && p.lat <= 1.44 && p.lon >= 103.6 && p.lon <= 104.05;
}

/** ?country=xx (not SG) → the code, else null. Resolving the city needs the catalogue (country.ts). */
export function countryParam(params: URLSearchParams): CountryCode | null {
  const raw = (params.get("country") ?? "").toUpperCase();
  return PICKER_LITE.some(([cc]) => cc === raw) && raw !== "SG" ? (raw as CountryCode) : null;
}
