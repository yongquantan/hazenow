/**
 * Malaysia, DOE APIMS (docs/sea/malaysia.md). No CORS for third parties → proxy.
 *
 * GET https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query
 *     ?where=1%3D1&outFields=*&returnGeometry=false&f=json
 * - API index only (per-station max sub-index, PM2.5 on a 24-h average). **No 1-hr PM2.5 exists in Malaysia.**
 * - `DATETIME` is local wall-clock time stored as if UTC: decode as UTC, relabel +08:00 (don't convert).
 * - During hh:00–hh:10 stations are rewritten in place: a null API then means "mid-update", keep the previous hour
 *   (mergeDoeUpdate).
 */
import { classifyIndex, myApiToPm25 } from "../scales.js";
import { msToIso, num } from "../time.js";
import type { Attribution, Observation } from "../types.js";

export const MYT = 8;
export const DOE_URL =
  "https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=STATION_ID,DATETIME,API,PARAM_SELECTED,CLASS,LATITUDE,LONGITUDE,STATION_LOCATION,PLACE,STATE_NAME,STATION_CATEGORY&returnGeometry=false&f=json";

export const DOE_ATTRIBUTION: Attribution = {
  id: "my.doe",
  text: "Data: Department of Environment Malaysia (DOE), APIMS",
  url: "https://eqms.doe.gov.my/",
  licence: "No licence stated; relayed with attribution pending DOE permission",
};

interface DoeAttributes {
  STATION_ID?: string;
  DATETIME?: number | null;
  API?: number | string | null;
  PARAM_SELECTED?: string | null;
  CLASS?: string | null;
  LATITUDE?: number;
  LONGITUDE?: number;
  STATION_LOCATION?: string;
  PLACE?: string;
  STATE_NAME?: string;
  STATION_CATEGORY?: string;
}

/** DOE's fake-UTC epoch → "YYYY-MM-DDTHH:mm:ss+08:00" (relabel, not convert). */
export function doeTime(epochMs: number): string {
  return msToIso(epochMs, 0).replace("+00:00", "+08:00");
}

export function doeObservations(raw: unknown): Observation[] {
  const features = (raw as { features?: { attributes?: DoeAttributes }[] })?.features;
  if (!Array.isArray(features)) return [];
  const out: Observation[] = [];
  for (const f of features) {
    const a = f?.attributes;
    if (!a?.STATION_ID || typeof a.LATITUDE !== "number" || typeof a.LONGITUDE !== "number") continue;
    const api = typeof a.API === "string" && /^n\/?a$/i.test(a.API.trim()) ? null : num(a.API);
    const time = typeof a.DATETIME === "number" ? doeTime(a.DATETIME) : null;
    if (api === null || !time) continue; // offline or mid-update (see mergeDoeUpdate)
    const param = a.PARAM_SELECTED?.trim() || null;
    out.push({
      stationId: `my.doe:${a.STATION_ID}`,
      name: (a.STATION_LOCATION ?? a.STATION_ID).trim(),
      country: "MY",
      lat: a.LATITUDE,
      lon: a.LONGITUDE,
      grade: "reference",
      pm25_1h: null,
      pm25_24h: param === "PM2.5" ? myApiToPm25(api) : null,
      official: {
        scaleId: "my_api",
        name: "API",
        value: api,
        category: a.CLASS?.trim() || classifyIndex("my_api", api)?.labelEn || null,
        averaging: "24h",
        param,
        agency: "DOE Malaysia",
      },
      periodEnd: time,
      corrected: "none",
      attributionId: DOE_ATTRIBUTION.id,
    });
  }
  return out;
}

/**
 * Merge a fresh DOE poll over the previous one: stations missing from the new poll (null mid-update, or offline)
 * keep their previous observation for up to `keepMs` (default 2 h 15 min, after which they count as offline).
 */
export function mergeDoeUpdate(prev: readonly Observation[], next: readonly Observation[], now: number, keepMs = 8_100_000): Observation[] {
  const byId = new Map(next.map((o) => [o.stationId, o]));
  for (const p of prev) {
    if (!byId.has(p.stationId) && now - Date.parse(p.periodEnd) <= keepMs) byId.set(p.stationId, p);
  }
  return [...byId.values()];
}
