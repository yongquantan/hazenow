/**
 * Generic data-quality screens, applied by buildCountrySnapshot() before anything else (same rules in every client).
 *
 * 1. Plausibility guard: a PM2.5 value outside 0–1000 µg/m³ (1-hr, crowd "now", or the 24-h mean) cannot be real, and
 *    a rise of more than 400 µg/m³ from one hour to the next is a fault far more often than air. Such a station is
 *    flagged and left out, and the app says so calmly ("A station reading looked wrong and was left out").
 *    Reference case (coverage-hunt/id.md, 30 Sep 2026): KLH ISPU Palangka Raya reported a 24-h mean of 1372.89 µg/m³,
 *    while BMKG's 1-hr 793.8 at the same town is severe but possible.
 * 2. Offline rule: a station whose newest value is more than 24 h old is offline (Badung Sempidi, Bali, since
 *    29 Sep 2026 10:00 WITA). It is left out entirely: no number, no index row, no station row.
 */
import type { Observation } from "./types.js";

export const PM25_PLAUSIBLE_MIN = 0;
export const PM25_PLAUSIBLE_MAX = 1000;
/** Largest believable rise between consecutive hours, µg/m³. */
export const PM25_MAX_JUMP_1H = 400;
export const OFFLINE_AFTER_MS = 24 * 3600_000;

const HOUR = 3600_000;

export type QualityFlag = "out_of_range" | "jump";

const outOfRange = (v: number | null | undefined) =>
  typeof v === "number" && (!Number.isFinite(v) || v < PM25_PLAUSIBLE_MIN || v > PM25_PLAUSIBLE_MAX);

/** Why a station's reading looks wrong, or null when it passes. */
export function plausibility(o: Observation): QualityFlag | null {
  if (outOfRange(o.pm25_1h) || outOfRange(o.pm25_now) || outOfRange(o.pm25_24h)) return "out_of_range";
  const v = o.pm25_1h;
  if (typeof v === "number" && o.history?.length) {
    const end = Date.parse(o.periodEnd);
    const prev = o.history.find((h) => Math.abs(Date.parse(h.time) - (end - HOUR)) < 60_000)?.pm25;
    if (typeof prev === "number" && !outOfRange(prev) && v - prev > PM25_MAX_JUMP_1H) return "jump";
  }
  return null;
}

/** No value for more than 24 h. */
export function isOffline(o: Observation, now: number): boolean {
  const t = Date.parse(o.periodEnd);
  return !Number.isFinite(t) || now - t > OFFLINE_AFTER_MS;
}

export interface Screened {
  kept: Observation[];
  implausible: (Observation & { flag: QualityFlag })[];
  offline: Observation[];
}

/**
 * Split observations into kept / implausible / offline. Kept stations also lose any history point outside 0–1000
 * (a single bad hour shouldn't draw a spike on the chart).
 */
export function screenObservations(obs: readonly Observation[], now: number): Screened {
  const out: Screened = { kept: [], implausible: [], offline: [] };
  for (const o of obs) {
    if (isOffline(o, now)) {
      out.offline.push(o);
      continue;
    }
    const flag = plausibility(o);
    if (flag) {
      out.implausible.push({ ...o, flag });
      continue;
    }
    const badHist = o.history?.some((h) => outOfRange(h.pm25) || outOfRange(h.pm25Avg24h));
    out.kept.push(
      badHist
        ? { ...o, history: o.history!.map((h) => ({ ...h, pm25: outOfRange(h.pm25) ? null : h.pm25, pm25Avg24h: outOfRange(h.pm25Avg24h) ? null : h.pm25Avg24h })) }
        : o,
    );
  }
  return out;
}
