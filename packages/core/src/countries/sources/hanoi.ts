/**
 * Vietnam, Hanoi: moitruongthudo.vn (docs/sea/vietnam.md). No CORS → proxy.
 *
 *  GET https://moitruongthudo.vn/api/site              station registry ("longtitude" [sic])
 *  GET https://moitruongthudo.vn/public/dailystat/{id} 30 days of 5-min µg/m³ per pollutant (~2.3 MB!)
 *  GET https://moitruongthudo.vn/public/dailyaqi/{id}  hourly official VN_AQI sub-index per pollutant
 * Times are ICT wall clock with no offset. Hourly labels are hour-ending (best fit).
 * The 1-hr PM2.5 is our mean of the 5-min samples in (H−60 min, H], requiring ≥ 9 of 12.
 * The official hourly VN_AQI = max over pollutants at hour H; `value: 0` = no data. City-owned stations (#14, #15)
 * freeze for days while /api/site keeps showing their old AQI, so freshness comes from the series tail.
 */
import { classifyIndex } from "../scales.js";
import { HOUR_MS, num, wallToIso } from "../time.js";
import type { Attribution, Observation, ObservationHour } from "../types.js";

export const HANOI_BASE = "https://moitruongthudo.vn";
export const VN_ICT = 7;

export const HANOI_ATTRIBUTION: Attribution = {
  id: "vn.hanoi",
  text: "Data: Hanoi Environmental Monitoring Portal (moitruongthudo.vn) / CEM",
  url: "https://moitruongthudo.vn/",
  licence: "No licence stated; relayed with attribution pending permission",
};

export interface HanoiSite {
  id: number;
  name: string;
  latitude: number;
  longtitude: number;
  type?: string;
  aqi?: number;
  aqi_time?: string;
}

export function parseHanoiSites(raw: unknown): HanoiSite[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is HanoiSite => !!s && typeof s === "object" && typeof s.id === "number" && Number.isFinite(s.latitude) && Number.isFinite(s.longtitude),
  );
}

type Series = { time: string; value: string | number | null }[];

/** Hourly means (hour-ending, ISO +07:00) of 5-min samples; hours with < 9 valid samples are null. */
export function hourlyMeans(samples: Series, minSamples = 9): { time: string; pm25: number | null }[] {
  const buckets = new Map<number, number[]>();
  for (const s of samples) {
    const iso = wallToIso(s.time, VN_ICT);
    const v = num(s.value);
    if (!iso) continue;
    const t = Date.parse(iso);
    const end = Math.ceil(t / HOUR_MS) * HOUR_MS; // (H−60, H] → H
    if (!buckets.has(end)) buckets.set(end, []);
    if (v !== null) buckets.get(end)!.push(v);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([end, vs]) => ({
      time: new Date(end + VN_ICT * HOUR_MS).toISOString().slice(0, 19) + "+07:00",
      pm25: vs.length >= minSamples ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 : null,
    }));
}

/** Only complete hours: drop the bucket for the hour still in progress at `now`. */
function completeHours(rows: { time: string; pm25: number | null }[], now: number) {
  return rows.filter((r) => Date.parse(r.time) <= now);
}

export function hanoiObservation(
  site: HanoiSite,
  dailystat: unknown,
  dailyaqi: unknown,
  now: number,
  keepHours = 48,
): Observation | null {
  const pm = ((dailystat as Record<string, Series> | null)?.["PM2.5"] ?? []).slice(-12 * (keepHours + 2));
  const hours = completeHours(hourlyMeans(pm), now).slice(-keepHours);
  // Official hourly VN_AQI: max over pollutants per hour.
  const aqiByHour = new Map<number, number>();
  for (const series of Object.values((dailyaqi as Record<string, { time: string; value: number | null }[]>) ?? {})) {
    if (!Array.isArray(series)) continue;
    for (const p of series) {
      const iso = typeof p?.time === "string" ? wallToIso(p.time, VN_ICT) : null;
      const v = num(p?.value);
      if (!iso || v === null || v === 0) continue;
      const t = Date.parse(iso);
      aqiByHour.set(t, Math.max(aqiByHour.get(t) ?? 0, v));
    }
  }
  const lastPm = [...hours].reverse().find((h) => h.pm25 !== null);
  const aqiTimes = [...aqiByHour.keys()].sort((a, b) => a - b);
  const lastAqiT = aqiTimes[aqiTimes.length - 1];
  if (!lastPm && lastAqiT === undefined) return null;
  const aqi = lastAqiT !== undefined ? aqiByHour.get(lastAqiT)! : null;
  const history: ObservationHour[] = hours.map((h) => ({ time: h.time, pm25: h.pm25 }));
  return {
    stationId: `vn.hanoi:${site.id}`,
    name: site.name.trim(),
    country: "VN",
    lat: site.latitude,
    lon: site.longtitude,
    grade: "reference",
    pm25_1h: lastPm?.pm25 ?? null,
    official:
      aqi !== null
        ? { scaleId: "vn_aqi", name: "VN_AQI", value: aqi, category: classifyIndex("vn_aqi", aqi)?.labelLocal ?? null, averaging: "nowcast", param: null, agency: "VEA / Hanoi" }
        : null,
    periodEnd: lastPm?.time ?? new Date(lastAqiT + VN_ICT * HOUR_MS).toISOString().slice(0, 19) + "+07:00",
    history: history.length ? history : undefined,
    corrected: "none",
    attributionId: HANOI_ATTRIBUTION.id,
  };
}
