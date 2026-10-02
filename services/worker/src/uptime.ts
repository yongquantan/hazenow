/**
 * GET /v1/sensors/{id}/uptime — a community sensor's 7- and 30-day uptime and its median agreement with the nearest
 * official station, from the hourly logs (docs/sea/COMMUNITY_SENSORS.md: "publish the uptime and the agreement with
 * the nearest official station").
 *
 *  - uptime = fresh hours / hours in the window since logging began (fresh: ≥ 6 samples in the clock hour).
 *  - agreement: pairs of (sensor hour, station hour). 1-hr basis where the station publishes 1-hr PM2.5 (TH, ID BMKG,
 *    VN); otherwise the station's 24-hr value vs the sensor's trailing 24-h mean (≥ 18 fresh hours; MY DOE, ID ISPU).
 *    Reported as the median ratio sensor/official and the median absolute difference (µg/m³), from the sensor's
 *    values as served (uncalibrated). Pairs with the official value ≤ 10 µg/m³ are skipped for the ratio (as biasFactor).
 * Reads ≤ 720 + 720 rows. No location is taken from the caller.
 */
import { haversineKm } from "../../../packages/core/src/math.js";
import type { JobState } from "./jobs.js";
import { K, kvGetMany, parseOr } from "./store.js";

const HOUR_S = 3600;
export const NEAREST_MAX_KM = 25;

interface SensorRow {
  hour: number;
  network: string;
  country: string | null;
  lat: number;
  lon: number;
  pm25: number | null;
  rh: number | null;
  n: number;
  fresh: number;
}

interface StationRow {
  hour: number;
  pm25: number | null;
  pm25_24h: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

export const SENSOR_ID = /^(ag|sc):\d{1,12}$/;

export async function sensorUptime(db: D1Database, id: string, now: number, since: number | null) {
  const nowHour = Math.floor(now / 1000 / HOUR_S) * HOUR_S;
  const from30 = nowHour - 30 * 24 * HOUR_S;
  const rows = (
    await db
      .prepare("SELECT hour, network, country, lat, lon, pm25, rh, n, fresh FROM sensor_hours WHERE id = ?1 AND hour > ?2 ORDER BY hour")
      .bind(id, from30)
      .all<SensorRow>()
  ).results ?? [];
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const sinceS = since ? Math.floor(since / 1000) : rows[0].hour;

  const window = (days: number) => {
    const from = nowHour - days * 24 * HOUR_S;
    // Hours the log could have covered: the window, or less if logging began inside it.
    const hours = Math.max(1, Math.round((nowHour - Math.max(from, sinceS - HOUR_S)) / HOUR_S));
    const inWin = rows.filter((r) => r.hour > from);
    const fresh = inWin.filter((r) => r.fresh).length;
    return { hours, freshHours: fresh, loggedHours: inWin.length, uptime: r2(Math.min(1, fresh / hours)) };
  };

  // Nearest official station in the sensor's country (the jurisdiction's own network, REGIONAL §3.5).
  let nearest: { id: string; km: number; basis: "1h" | "24h" } | null = null;
  if (last.country) {
    const jobs = await kvGetMany(db, [K.job(last.country)]);
    const st = parseOr<JobState | null>(jobs.get(K.job(last.country)), null);
    for (const [sid, lat, lon, basis] of st?.stations ?? []) {
      const km = haversineKm({ lat: last.lat, lon: last.lon }, { lat, lon });
      if (km <= NEAREST_MAX_KM && (!nearest || km < nearest.km)) nearest = { id: sid, km, basis };
    }
  }

  let agreement: Record<string, unknown> | null = null;
  if (nearest) {
    const srows = (
      await db
        .prepare("SELECT hour, pm25, pm25_24h FROM station_hours WHERE id = ?1 AND hour > ?2 ORDER BY hour")
        .bind(nearest.id, from30 - 24 * HOUR_S)
        .all<StationRow>()
    ).results ?? [];
    const off = new Map(srows.map((r) => [r.hour, r]));
    const byHour = new Map(rows.map((r) => [r.hour, r]));
    const agree = (days: number) => {
      const from = nowHour - days * 24 * HOUR_S;
      const ratios: number[] = [];
      const diffs: number[] = [];
      for (const r of rows) {
        if (r.hour <= from || !r.fresh || r.pm25 === null) continue;
        const o = off.get(r.hour);
        if (!o) continue;
        let sensor: number | null = r.pm25;
        let official: number | null = o.pm25;
        if (nearest!.basis === "24h") {
          official = o.pm25_24h;
          const day: number[] = [];
          for (let h = r.hour - 23 * HOUR_S; h <= r.hour; h += HOUR_S) {
            const x = byHour.get(h);
            if (x?.fresh && x.pm25 !== null) day.push(x.pm25);
          }
          sensor = day.length >= 18 ? day.reduce((a, b) => a + b, 0) / day.length : null;
        }
        if (sensor === null || official === null) continue;
        diffs.push(Math.abs(sensor - official));
        if (official > 10 && sensor > 10) ratios.push(sensor / official);
      }
      return { pairs: diffs.length, medianRatio: r2(median(ratios)), medianAbsDiff: r1(median(diffs)) };
    };
    agreement = {
      station: nearest.id,
      distanceKm: r1(nearest.km),
      basis: nearest.basis,
      last7d: agree(7),
      last30d: agree(30),
    };
  }

  return {
    id,
    network: last.network,
    country: last.country,
    location: { lat: last.lat, lon: last.lon, rounded: "3dp" },
    lastHour: new Date(last.hour * 1000).toISOString(),
    last: { pm25: last.pm25, rh: last.rh, samples: last.n, fresh: !!last.fresh },
    loggingSince: new Date(sinceS * 1000).toISOString(),
    uptime: { last7d: window(7), last30d: window(30) },
    agreement,
    ...(agreement ? {} : { agreementNote: `No official station within ${NEAREST_MAX_KM} km in ${last.country ?? "this country"}` }),
    method:
      "Hourly buckets from 5-min polls of the AirGradient map feed. Fresh = at least 6 samples in the clock hour. Agreement uses values as served (uncalibrated): median sensor/official ratio and median absolute difference, 1-hr where the station publishes it, else 24-hr.",
  };
}
