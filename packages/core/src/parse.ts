/** Pure parsers for data.gov.sg v2 real-time API responses. Tolerant of missing fields. */
import { REGION_COORDS } from "./constants.js";
import { cleanReading } from "./math.js";
import type { HourReading, LatLon } from "./types.js";

export interface ApiItem {
  date?: string;
  timestamp?: string;
  updatedTimestamp?: string;
  update_timestamp?: string;
  readings?: Record<string, Record<string, number | null> | undefined>;
}

export interface ApiResponse {
  code?: number;
  errorMsg?: string;
  data?: {
    regionMetadata?: { name: string; labelLocation?: { latitude?: number; longitude?: number } }[];
    items?: ApiItem[];
  };
}

export const PM25_KEY = "pm25_one_hourly";
export const PSI24_KEY = "psi_twenty_four_hourly";
export const PM25_24H_KEY = "pm25_twenty_four_hourly";

/** Raw v1 response (`api.data.gov.sg/v1/environment/*`), snake_case. */
export interface V1Response {
  region_metadata?: { name: string; label_location?: { latitude?: number; longitude?: number } }[];
  items?: ApiItem[];
  api_info?: { status?: string };
  message?: string;
}

/**
 * Normalise a v1 response into the v2 shape used everywhere else.
 * v2 responses are returned unchanged; anything unusable becomes null.
 */
export function fromV1(raw: unknown): ApiResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as V1Response & ApiResponse;
  if (r.data !== undefined) return isOkResponse(r) ? r : null; // already v2
  if (!Array.isArray(r.items)) return null;
  return {
    code: 0,
    data: {
      regionMetadata: (r.region_metadata ?? []).map((m) => ({ name: m.name, labelLocation: m.label_location })),
      items: r.items,
    },
  };
}

export function isOkResponse(r: unknown): r is ApiResponse {
  if (!r || typeof r !== "object") return false;
  const a = r as ApiResponse;
  return (a.code === undefined || a.code === 0) && Array.isArray(a.data?.items);
}

/**
 * Region coordinates, read from `regionMetadata` (preferred) merged over the hard-coded fallback.
 * Region names not in the fallback are included if the API provides coordinates for them.
 */
export function parseRegionCoords(...responses: (ApiResponse | null | undefined)[]): Record<string, LatLon> {
  const out: Record<string, LatLon> = { ...REGION_COORDS };
  for (const r of responses) {
    for (const m of r?.data?.regionMetadata ?? []) {
      const lat = m.labelLocation?.latitude;
      const lon = m.labelLocation?.longitude;
      if (m.name && typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon)) {
        // "national" etc. would not be a spatial region; data.gov.sg gives it 0,0 in some datasets.
        if (lat === 0 && lon === 0) continue;
        out[m.name] = { lat, lon };
      }
    }
  }
  return out;
}

/** Extract hourly readings for one reading key (e.g. pm25_one_hourly). Invalid values become null. */
export function parseHours(resp: ApiResponse | null | undefined, key: string): HourReading[] {
  const out: HourReading[] = [];
  for (const item of resp?.data?.items ?? []) {
    const time = item.timestamp;
    if (!time || Number.isNaN(Date.parse(time))) continue;
    const raw = item.readings?.[key];
    if (!raw || typeof raw !== "object") continue;
    const values: Record<string, number | null> = {};
    for (const [region, v] of Object.entries(raw)) values[region] = cleanReading(v);
    out.push({ time, published: item.updatedTimestamp ?? item.update_timestamp ?? time, values });
  }
  return out;
}

/**
 * Merge hourly readings from several responses, de-duplicated by hour.
 * When the same hour appears twice, the later-published copy wins (values can be back-filled),
 * but a valid value is never replaced by an invalid one.
 * Result is sorted oldest → newest.
 */
export function mergeHours(...lists: HourReading[][]): HourReading[] {
  const byHour = new Map<number, HourReading>();
  for (const list of lists) {
    for (const h of list) {
      const k = Date.parse(h.time);
      const prev = byHour.get(k);
      if (!prev) {
        byHour.set(k, { ...h, values: { ...h.values } });
        continue;
      }
      const newer = Date.parse(h.published) >= Date.parse(prev.published) ? h : prev;
      const older = newer === h ? prev : h;
      const values: Record<string, number | null> = { ...older.values };
      for (const [r, v] of Object.entries(newer.values)) if (v !== null || !(r in values)) values[r] = v;
      byHour.set(k, { time: newer.time, published: newer.published, values });
    }
  }
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h);
}

/**
 * SPEC v1.3 merge of the two sources, per hour and region:
 * v2 value if valid, else v1 value if valid, else invalid (null).
 * `published` = v1's update_timestamp when v1 has that hour (v2 re-stamps later with the same values).
 */
export function mergeV1V2(v1: HourReading[], v2: HourReading[]): HourReading[] {
  const a = new Map(v1.map((h) => [Date.parse(h.time), h]));
  const b = new Map(v2.map((h) => [Date.parse(h.time), h]));
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  return keys.map((k) => {
    const h1 = a.get(k);
    const h2 = b.get(k);
    const regions = new Set([...Object.keys(h1?.values ?? {}), ...Object.keys(h2?.values ?? {})]);
    const values: Record<string, number | null> = {};
    for (const r of regions) {
      const v2v = h2?.values[r];
      const v1v = h1?.values[r];
      values[r] = v2v !== null && v2v !== undefined ? v2v : v1v !== null && v1v !== undefined ? v1v : null;
    }
    return { time: (h1 ?? h2)!.time, published: (h1 ?? h2)!.published, values };
  });
}
