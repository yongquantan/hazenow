/**
 * AirGradient community sensors (REGIONAL §1, ARCHITECTURE_V2 §3). No CORS → proxy for web.
 *
 * Primary: map API (EPA-corrected `pm25`, merges AirGradient + Sensor.Community + OpenAQ):
 *   GET https://map-data-int.airgradient.com/map/api/v1/measurements/current/area?xmin&ymin&xmax&ymax&zoom=12&measure=pm25
 *   One SEA bbox (92–141.2 E, −11.2–28.6 N) returns every sensor in one ~140 KB call.
 * Fallback: world API (raw `pm02` + `rhum` + `model`) → EPA-extended applied here; `I-*` models are indoor.
 *   Its JSON contains stray control characters and was once truncated → parseLenientJson.
 * Sensor.Community rows (`dataSource: "SensorCommunity"`) are kept, tagged by their real network (`sc:` ids, ODbL
 * attribution): they unlock Johor Bahru ("Iolite", SPS30) and Siem Reap (coverage-hunt/my-bn.md, vn-kh-la.md). Their
 * value is taken as served (`corrected: "none"`: mostly SDS011 with no RH correction), and a row at RH ≥ 90 % is left
 * out, because an uncorrected optical sensor over-reads in fog and very humid air (docs/sea/COMMUNITY_SENSORS.md).
 * Excluded: OpenAQ "Reference" rows (they are Air4Thai stations, ~1 h late: use Air4Thai directly).
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

/** Sensor.Community rows in the AirGradient map feed. Licence per REGIONAL.md (the database is ODbL 1.0). */
export const SC_ATTRIBUTION: Attribution = {
  id: "crowd.sensorcommunity",
  text: "Community sensors: Sensor.Community contributors, ODbL 1.0",
  url: "https://sensor.community/",
  licence: "ODbL 1.0",
  shareAlike: true,
};

/** Uncorrected Sensor.Community rows at or above this relative humidity (%) are left out. */
export const SC_MAX_RH = 90;

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

/** "SensorCommunity: 94332" → "Sensor.Community #94332"; named rows keep their name. */
function scName(r: AgMapRow): string {
  const n = (r.locationName ?? "").trim();
  const m = /^SensorCommunity:\s*(\d+)$/i.exec(n);
  if (m) return `Sensor.Community #${m[1]}`;
  return n || `Sensor.Community ${r.locationId}`;
}

/**
 * `locate` defaults to the polygon lookup; a long-running server can pass a memoised one (sensors rarely move, and
 * the lookup dominates this function's CPU cost).
 */
export function agMapObservations(
  raw: unknown,
  countries?: readonly CountryCode[],
  locate: (lat: number, lon: number) => CountryCode | null = countryAt,
): Observation[] {
  const rows = (raw as { data?: AgMapRow[] })?.data;
  if (!Array.isArray(rows)) return [];
  const out: Observation[] = [];
  for (const r of rows) {
    const sc = r?.dataSource === "SensorCommunity";
    if (r?.dataSource !== "AirGradient" && !sc) continue;
    if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude) || typeof r.pm25 !== "number" || r.pm25 < 0) continue;
    if (!r.measuredAt || Number.isNaN(Date.parse(r.measuredAt))) continue;
    if (sc && typeof r.rhum === "number" && r.rhum >= SC_MAX_RH) continue;
    const cc = locate(r.latitude, r.longitude);
    if (!cc || (countries && !countries.includes(cc))) continue;
    const name = sc ? scName(r) : (r.locationName ?? `AirGradient ${r.locationId}`).trim();
    out.push({
      stationId: `${sc ? "sc" : "ag"}:${r.locationId}`,
      name,
      country: cc,
      lat: r.latitude,
      lon: r.longitude,
      grade: "lowcost",
      indoor: isIndoorName(name),
      pm25_now: Math.round(r.pm25 * 10) / 10,
      periodEnd: r.measuredAt,
      corrected: sc ? "none" : "source",
      k: null,
      qc: "uncalibrated",
      attributionId: sc ? SC_ATTRIBUTION.id : AG_ATTRIBUTION.id,
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
