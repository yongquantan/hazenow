/**
 * Where the web app starts (SPEC v1.4 + v2.1), as a pure function so it can be tested without a browser.
 * Order: URL params (shared links, embeds) → the saved choice → the device's country guess → Singapore.
 * A guess never persists: only the visitor's own choice is saved.
 */
import { findArea, REGION_COORDS, roundCoord, type CountryGuess, type LatLon } from "hazenow";
import type { CityWhere } from "./country";
import { countryParam } from "./country-lite";

/** Where to check. Coordinates are always rounded to 2 decimals (~1 km) before use or storage. */
export type Place =
  | { kind: "gps"; point: LatLon }
  | { kind: "area"; name: string; point: LatLon }
  | { kind: "region"; region: string }
  | { kind: "island" }
  | CityWhere; // SPEC v2.0: another country (catalogue city or GPS point), rendered by country.ts

export type StartSource = "link" | "saved" | "guess" | "default";

export interface Start {
  where: Place;
  firstRun: boolean;
  source: StartSource;
  /** Only when source is "guess": the guess behind the starting place. */
  guess: CountryGuess | null;
}

export const rounded = (pt: LatLon): LatLon => ({ lat: roundCoord(pt.lat), lon: roundCoord(pt.lon) });

/** A city not yet resolved against the catalogue (country.ts fills in its name and point at boot). */
export const pendingCity = (country: CityWhere["country"], id: string): CityWhere => ({ kind: "city", country, id, name: "", point: { lat: 0, lon: 0 } });

/**
 * @param get   storage reader (localStorage in the app)
 * @param guess the device guess, or null when there's none to use (embeds, mock mode)
 */
export function resolveStart(params: URLSearchParams, get: <T>(key: string, fallback: T) => T, guess: CountryGuess | null, embed = false): Start {
  const link = (where: Place): Start => ({ where, firstRun: false, source: "link", guess: null });
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon)) {
    // Outside Singapore's core box, boot() resolves the country with locate() once country.ts has loaded.
    return link({ kind: "gps", point: rounded({ lat, lon }) });
  }
  // ?country=th&area=bangkok (SG's own ?area= / ?region= links below are unchanged). Resolved in boot().
  const cc = countryParam(params);
  if (cc) return link(pendingCity(cc, params.get("area") ?? ""));
  const area = params.get("area") ? findArea(params.get("area")!) : null;
  if (area) return link({ kind: "area", name: area.name, point: rounded(area) });
  const r = (params.get("region") ?? "").toLowerCase();
  if (r === "island") return link({ kind: "island" });
  if (r in REGION_COORDS) return link({ kind: "region", region: r });
  const saved = get<Place | null>("hn.where", null);
  if (saved) return { where: saved, firstRun: false, source: "saved", guess: null };
  const legacy = get<string | null>("hn.region", null); // pre-v1.4 installs
  if (legacy && legacy in REGION_COORDS) return { where: { kind: "region", region: legacy }, firstRun: false, source: "saved", guess: null };
  if (embed || !guess) return { where: { kind: "island" }, firstRun: !embed, source: "default", guess: null };
  // SPEC v2.1: a guessed country other than Singapore starts at its place (resolved against the catalogue in boot()).
  if (guess.country && guess.country !== "SG") return { where: pendingCity(guess.country, guess.place ?? ""), firstRun: true, source: "guess", guess };
  // Singapore, or outside Southeast Asia: the island view, exactly as before (outside also gets a picker hint).
  return { where: { kind: "island" }, firstRun: true, source: "guess", guess };
}
