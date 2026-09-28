/**
 * AirGradient community sensors (REGIONAL §1, ARCHITECTURE_V2 §3). No CORS → proxy for web.
 *
 * Primary: map API (EPA-corrected `pm25`, merges AirGradient + Sensor.Community + OpenAQ):
 *   GET https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin&ymin&xmax&ymax&zoom=12&measure=pm25
 *   One SEA bbox (92–141.2 E, −11.2–28.6 N) returns every sensor in one ~140 KB call.
 * Fallback: world API (raw `pm02` + `rhum` + `model`) → EPA-extended applied here; `I-*` models are indoor.
 *   Its JSON contains stray control characters and was once truncated → parseLenientJson.
 * Excluded: OpenAQ "Reference" rows (they are Air4Thai stations, ~1 h late: use Air4Thai directly) and
 * Sensor.Community rows (SDS011 without RH correction, philippines.md).
 * Country comes from the polygon lookup (sensors' `timezone` fields are unreliable).
 */
import { countryAt } from "../borders.js";
import { epaExtended } from "../crowd.js";
import type { Attribution, CountryCode, Observation } from "../types.js";

export const AG_MAP_BASE = "https://map-data-int.airgradient.com/map/api/v1";
export const AG_WORLD_URL = "https://api.airgradient.com/public/api/v1/world/locations/measures/current";
export const SEA_BBOX = { xmin: 92, ymin: -11.2, xmax: 141.2, ymax: 28.6 } as const;

export const AG_ATTRIBUTION: Attribution = {
  id: "crowd.airgradient",
  text: "Community sensors: AirGradient contributors, CC BY-SA 4.0",
  url: "https://www.airgradient.com/map/",
  licence: "CC BY-SA 4.0",
  shareAlike: true,
};

export function agAreaUrl(b: { xmin: number; ymin: number; xmax: number; ymax: number } = SEA_BBOX, base = AG_MAP_BASE): string {
  return `${base}/measurements/current/area?xmin=${b.xmin}&ymin=${b.ymin}&xmax=${b.xmax}&ymax=${b.ymax}&zoom=12&measure=pm25`;
}

interface AgMapRow {
  locationId: number;
  locationName?: string;
  latitude: number;
  longitude: number;
  sensorType?: string;
  pm25?: number | null;
  rhum?: number | null;
  measuredAt?: string;
  dataSource?: string;
}

const isIndoorName = (n: string) => /\bindoor\b/i.test(n);

export function agMapObservations(raw: unknown, countries?: readonly CountryCode[]): Observation[] {
  const rows = (raw as { data?: AgMapRow[] })?.data;
  if (!Array.isArray(rows)) return [];
  const out: Observation[] = [];
  for (const r of rows) {
    if (r?.dataSource !== "AirGradient") continue;
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || typeof r.pm25 !== "number" || r.pm25 < 0) continue;
    if (!r.measuredAt || Number.isNaN(Date.parse(r.measuredAt))) continue;
    const cc = countryAt(r.latitude, r.longitude);
    if (!cc || (countries && !countries.includes(cc))) continue;
    const name = (r.locationName ?? `AirGradient ${r.locationId}`).trim();
    out.push({
      stationId: `ag:${r.locationId}`,
      name,
      country: cc,
      lat: r.latitude,
      lon: r.longitude,
      grade: "lowcost",
      indoor: isIndoorName(name),
      pm25_now: Math.round(r.pm25 * 10) / 10,
      periodEnd: r.measuredAt,
      corrected: "source",
      k: null,
      qc: "uncalibrated",
      attributionId: AG_ATTRIBUTION.id,
    });
  }
  return out;
}

/** JSON.parse tolerant of raw control characters and a truncated/garbled tail (AirGradient world dump). */
export function parseLenientJson(text: string): unknown {
  const clean = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ");
  try {
    return JSON.parse(clean);
  } catch {
    const cut = clean.lastIndexOf("},{");
    if (cut > 0) {
      try {
        return JSON.parse(clean.slice(0, cut + 1) + "]");
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

interface AgWorldRow {
  locationId: number;
  locationName?: string;
  latitude: number;
  longitude: number;
  offline?: boolean;
  pm02?: number | null;
  rhum?: number | null;
  timestamp?: string;
  model?: string | null;
}

/** World dump (raw pm02) → EPA-extended corrected observations. Indoor models (`I-…`) are flagged, not dropped. */
export function agWorldObservations(raw: unknown, countries?: readonly CountryCode[]): Observation[] {
  if (!Array.isArray(raw)) return [];
  const out: Observation[] = [];
  for (const r of raw as AgWorldRow[]) {
    if (!r || r.offline || typeof r.pm02 !== "number" || r.pm02 < 0 || !r.timestamp) continue;
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    if (r.longitude < SEA_BBOX.xmin || r.longitude > SEA_BBOX.xmax || r.latitude < SEA_BBOX.ymin || r.latitude > SEA_BBOX.ymax) continue;
    const cc = countryAt(r.latitude, r.longitude);
    if (!cc || (countries && !countries.includes(cc))) continue;
    const name = (r.locationName ?? `AirGradient ${r.locationId}`).trim();
    out.push({
      stationId: `agw:${r.locationId}`,
      name,
      country: cc,
      lat: r.latitude,
      lon: r.longitude,
      grade: "lowcost",
      indoor: (r.model ?? "").startsWith("I-") || isIndoorName(name),
      pm25_now: Math.round(epaExtended(r.pm02, r.rhum ?? NaN) * 10) / 10,
      periodEnd: r.timestamp,
      corrected: "epa_ext",
      k: null,
      qc: "uncalibrated",
      attributionId: AG_ATTRIBUTION.id,
    });
  }
  return out;
}
