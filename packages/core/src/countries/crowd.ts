/**
 * Crowd-sensor correction and QC (ARCHITECTURE_V2 §3, DATA_SOURCES §2.2). Pure; identical in every client and
 * in services/proxy.
 *
 * 1. Physical correction: EPA-extended (Barkjohn 2022) on raw PMS5003 cf_1 + RH. Skipped when the source
 *    already corrects (AirGradient map API `pm25`).
 * 2. Local bias factor `k` against the jurisdiction's official anchor, where one exists:
 *    - 1-hr anchors (SG NEA, TH Air4Thai, ID BMKG): median over ≥6 hour-pairs of anchor/sensor, both > 10 µg/m³,
 *      ratio IQR ≤ 0.5, k in [0.5, 2.0] (outside → drop the sensor).
 *    - 24-h anchor (MY DOE, inverted API): anchor 24-h mean / sensor 24-h mean over ≥18 hourly buckets (malaysia.md).
 *    - No anchor (PH, LA, KH): k = null, "uncalibrated"; the value is shown as an estimate with a wider range.
 * 3. QC: indoor, stale (> 15 min), zero-with-busy-neighbours, and the cluster outlier rule: a sensor more than 3× the
 *    median of its cluster (the sensors within 10 km, itself included) is dropped when the cluster has at least 4
 *    sensors and the sensor is at least 10 µg/m³ above that median (a noise floor, so clean-air jitter near zero is
 *    never flagged). Generic: it is what drops Pai's NT/TOT unit (23.8 vs a median of 6.8, coverage-hunt/th.md).
 */
import { haversineKm } from "../math.js";
import type { Observation } from "./types.js";

/** EPA-extended correction for PMS5003 cf_1 (µg/m³) and RH (%). Clamped at ≥ 0. */
export function epaExtended(pa: number, rh: number): number {
  const RH = Number.isFinite(rh) ? rh : 50;
  let c: number;
  if (pa < 30) c = 0.524 * pa - 0.0862 * RH + 5.75;
  else if (pa < 50) {
    const f = pa / 20 - 1.5;
    c = (0.786 * f + 0.524 * (1 - f)) * pa - 0.0862 * RH + 5.75;
  } else if (pa < 210) c = 0.786 * pa - 0.0862 * RH + 5.75;
  else if (pa < 260) {
    const w = pa / 50 - 4.2;
    c = (0.69 * w + 0.786 * (1 - w)) * pa - 0.0862 * RH * (1 - w) + 2.966 * w + 5.75 * (1 - w) + 8.84e-4 * pa * pa * w;
  } else c = 2.966 + 0.69 * pa + 8.84e-4 * pa * pa;
  return Math.max(0, Math.round(c * 100) / 100);
}

export interface BiasResult {
  k: number | null;
  pairs: number;
  iqr: number | null;
  qc: "ok" | "erratic" | "uncalibrated";
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * ARCHITECTURE_V2 §3 step 3–4 for a 1-hr anchor. `pairs` are hour-aligned (anchor, sensor) values.
 * Test vector: anchor [100,110,90] vs sensor [80,88,72] → k 1.25 (with minPairs lowered to 3).
 */
export function biasFactor(pairs: readonly { anchor: number; sensor: number }[], minPairs = 6): BiasResult {
  const ratios = pairs.filter((p) => p.anchor > 10 && p.sensor > 10).map((p) => p.anchor / p.sensor).sort((a, b) => a - b);
  if (ratios.length < minPairs) return { k: null, pairs: ratios.length, iqr: null, qc: "uncalibrated" };
  const med = quantile(ratios, 0.5);
  const iqr = quantile(ratios, 0.75) - quantile(ratios, 0.25);
  if (iqr > 0.5 || med < 0.5 || med > 2.0) return { k: null, pairs: ratios.length, iqr, qc: "erratic" };
  return { k: Math.round(med * 1000) / 1000, pairs: ratios.length, iqr, qc: "ok" };
}

/** MY variant: anchor is the DOE implied 24-h PM2.5; sensor side is the mean of its last 24 hourly buckets (≥ 18). */
export function biasFactor24h(anchor24h: number | null, sensorHourly: readonly number[]): BiasResult {
  const vals = sensorHourly.filter((v) => Number.isFinite(v) && v >= 0);
  if (anchor24h === null || vals.length < 18) return { k: null, pairs: vals.length, iqr: null, qc: "uncalibrated" };
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean <= 10 || anchor24h <= 10) return { k: null, pairs: vals.length, iqr: null, qc: "uncalibrated" };
  const k = anchor24h / mean;
  if (k < 0.5 || k > 2.0) return { k: null, pairs: vals.length, iqr: null, qc: "erratic" };
  return { k: Math.round(k * 1000) / 1000, pairs: vals.length, iqr: null, qc: "ok" };
}

export const CROWD_MAX_AGE_MIN = 15;
/** Cluster outlier rule (see header, step 3). */
export const OUTLIER_CLUSTER_KM = 10;
export const OUTLIER_MIN_CLUSTER = 4;
export const OUTLIER_FACTOR = 3;
export const OUTLIER_FLOOR = 10;

/**
 * QC flags for a list of crowd observations (mutates copies, returns them). Only `qc: "ok"` / "uncalibrated"
 * sensors are usable; `k` is left as given.
 */
export function crowdQc(obs: readonly Observation[], now: number): Observation[] {
  const out = obs.map((o) => ({ ...o }));
  for (const o of out) {
    if (o.indoor) o.qc = "indoor";
    else if ((now - Date.parse(o.periodEnd)) / 60_000 > CROWD_MAX_AGE_MIN) o.qc = "stale";
  }
  const live = out.filter((o) => o.qc !== "indoor" && o.qc !== "stale" && o.qc !== "erratic");
  const val = (o: Observation) => o.pm25_now ?? o.pm25_1h;
  for (const o of live) {
    const v = val(o);
    if (v === null || v === undefined) continue;
    const neigh = live
      .filter((n) => n !== o && haversineKm(o, n) <= OUTLIER_CLUSTER_KM)
      .map(val)
      .filter((x): x is number => typeof x === "number")
      .sort((a, b) => a - b);
    // Cluster rule: ≥ 4 sensors (itself included), > 3× the cluster median and ≥ 10 µg/m³ above it.
    const cluster = [...neigh, v].sort((a, b) => a - b);
    if (cluster.length >= OUTLIER_MIN_CLUSTER) {
      const cm = quantile(cluster, 0.5);
      if (v > OUTLIER_FACTOR * cm && v - cm >= OUTLIER_FLOOR) {
        o.qc = "outlier";
        continue;
      }
    }
    if (neigh.length < 2) continue;
    const med = quantile(neigh, 0.5);
    // Stuck at zero while the neighbours are busy, or far below them.
    if ((v === 0 && med > 5) || (v > 15 && v * 3 < med)) o.qc = "outlier";
  }
  return out;
}

export function usableCrowd(o: Observation): boolean {
  return o.grade === "lowcost" && (o.qc === undefined || o.qc === "ok" || o.qc === "uncalibrated");
}
