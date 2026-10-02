/**
 * The proxy's in-memory rings (services/proxy/src/rings.ts), made persistent and compact so a cron run can load,
 * update and store them in a few hundred microseconds:
 *  - OfficialRing: per official station, the hourly values we have seen (BMKG, DOE and ISPU publish only the
 *    latest hour), 48 h, with the first time we saw each hour (their feeds carry no publish stamp).
 *  - Crowd samples: per sensor, the readings polled in the last 75 min → rolling 1-hr mean and the clock-hour
 *    means that feed calibration (crowdh:{cc}, 25 h) and the hourly log (sensor_hours).
 * Same rules as the proxy: hour keys rounded to the hour, ≥ 6 samples before a crowd mean counts.
 */
import type { Observation } from "../../../packages/core/src/countries/index.js";

export const HOUR = 3600_000;
export const hourKey = (t: number) => Math.round(t / HOUR) * HOUR;
/** Crowd: ≥ 6 five-minute samples (half the hour) before a mean counts (the proxy's MIN_SAMPLES). */
export const MIN_SAMPLES = 6;

/** stationId → [hourKey, pm25, pm25_24h, firstSeen, periodEnd as published][] (oldest → newest). */
export type RingRow = [number, number | null, number | null, number, string];
export type OfficialRing = Record<string, RingRow[]>;

export function ringRecord(ring: OfficialRing, o: Observation, now: number, keepMs = 48 * HOUR): void {
  const t = Date.parse(o.periodEnd);
  if (!Number.isFinite(t)) return;
  const k = hourKey(t);
  const rows = (ring[o.stationId] ??= []);
  const i = rows.findIndex((r) => r[0] === k);
  const prev = i >= 0 ? rows[i] : null;
  const row: RingRow = [k, o.pm25_1h ?? prev?.[1] ?? null, o.pm25_24h ?? prev?.[2] ?? null, prev?.[3] ?? now, o.periodEnd];
  if (i >= 0) rows[i] = row;
  else {
    rows.push(row);
    rows.sort((a, b) => a[0] - b[0]);
  }
  while (rows.length && rows[0][0] < now - keepMs) rows.shift();
}

/** Drop stations not seen for 48 h. */
export function ringPrune(ring: OfficialRing, now: number, keepMs = 48 * HOUR): void {
  for (const [id, rows] of Object.entries(ring)) if (!rows.length || rows[rows.length - 1][0] < now - keepMs) delete ring[id];
}

/** Attach ring history + first-seen stamp to observations that don't bring their own history (Rings.withHistory). */
export function withHistory(ring: OfficialRing, o: Observation): Observation {
  const rows = ring[o.stationId];
  if (!rows) return o;
  const cur = rows.find((r) => r[0] === hourKey(Date.parse(o.periodEnd)));
  return {
    ...o,
    publishedAt: cur ? new Date(cur[3]).toISOString() : o.publishedAt ?? null,
    history: o.history ?? rows.map((r) => ({ time: r[4], pm25: r[1], pm25Avg24h: r[2] })),
  };
}

/* ------------------------------------------------------------------ crowd samples */

export interface SensorSamples {
  /** Sample times (ms, measuredAt) and values, oldest → newest. */
  t: number[];
  v: number[];
  rh: (number | null)[];
}

export function recordSample(s: SensorSamples, t: number, v: number, rh: number | null): void {
  if (s.t.includes(t)) return;
  s.t.push(t);
  s.v.push(v);
  s.rh.push(rh);
}

export function pruneSamples(s: SensorSamples, cut: number): void {
  while (s.t.length && s.t[0] < cut) {
    s.t.shift();
    s.v.shift();
    s.rh.shift();
  }
}

/** Mean of samples in (now − 60 min, now], rounded to 1 dp, or null with < MIN_SAMPLES (Rings.crowdRolling1h). */
export function rolling1h(s: SensorSamples, now: number): number | null {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < s.t.length; i++)
    if (s.t[i] > now - HOUR && s.t[i] <= now) {
      sum += s.v[i];
      n++;
    }
  return n < MIN_SAMPLES ? null : Math.round((sum / n) * 10) / 10;
}

/** The clock hour (end − 60 min, end]: sample count, mean PM2.5 and mean RH. */
export function hourStats(s: SensorSamples, end: number): { n: number; pm25: number | null; rh: number | null } {
  let sum = 0;
  let n = 0;
  let rhSum = 0;
  let rhN = 0;
  for (let i = 0; i < s.t.length; i++) {
    if (s.t[i] <= end - HOUR || s.t[i] > end) continue;
    sum += s.v[i];
    n++;
    const rh = s.rh[i];
    if (typeof rh === "number") {
      rhSum += rh;
      rhN++;
    }
  }
  return { n, pm25: n ? sum / n : null, rh: rhN ? Math.round((rhSum / rhN) * 10) / 10 : null };
}
