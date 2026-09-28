/**
 * In-memory rings (REGIONAL §4.3 "compute once"):
 *  - official: per station, the hourly values we have seen (BMKG, DOE and ISPU publish only the latest hour),
 *    48 h, with the first time we saw each hour (their feeds carry no publish stamp).
 *  - crowd: per sensor, the minute readings we polled (25 h) → rolling 1-hr mean and clock-hour means.
 * They warm up after a restart; until then observations simply carry less history and crowd sensors stay
 * "uncalibrated".
 */
import type { Observation, ObservationHour } from "../../../packages/core/src/countries/index.js";

const HOUR = 3600_000;
export const hourKey = (t: number) => Math.round(t / HOUR) * HOUR;
/** Crowd: ≥ 6 five-minute samples (half the hour) before a mean counts. */
export const MIN_SAMPLES = 6;

export class Rings {
  private official = new Map<string, Map<number, ObservationHour & { firstSeen: number }>>();
  private crowd = new Map<string, { t: number; v: number }[]>();

  recordOfficial(o: Observation, now: number): void {
    const t = Date.parse(o.periodEnd);
    if (!Number.isFinite(t)) return;
    let m = this.official.get(o.stationId);
    if (!m) this.official.set(o.stationId, (m = new Map()));
    const k = hourKey(t);
    const prev = m.get(k);
    m.set(k, {
      time: o.periodEnd,
      pm25: o.pm25_1h ?? prev?.pm25 ?? null,
      pm25Avg24h: o.pm25_24h ?? prev?.pm25Avg24h ?? null,
      firstSeen: prev?.firstSeen ?? now,
    });
    for (const key of m.keys()) if (key < now - 48 * HOUR) m.delete(key);
  }

  /** Attach ring history + first-seen stamp to observations that don't bring their own history. */
  withHistory(o: Observation): Observation {
    const m = this.official.get(o.stationId);
    if (!m) return o;
    const rows = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const cur = m.get(hourKey(Date.parse(o.periodEnd)));
    return {
      ...o,
      // None of these feeds carries a publish stamp: "published" = the first time we saw that hour.
      publishedAt: cur ? new Date(cur.firstSeen).toISOString() : o.publishedAt ?? null,
      history: o.history ?? rows.map(([, h]) => ({ time: h.time, pm25: h.pm25, pm25Avg24h: h.pm25Avg24h })),
    };
  }

  officialHourly(stationId: string): { t: number; pm25: number | null; pm25Avg24h: number | null }[] {
    const m = this.official.get(stationId);
    if (!m) return [];
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([t, h]) => ({ t, pm25: h.pm25, pm25Avg24h: h.pm25Avg24h ?? null }));
  }

  recordCrowd(o: Observation, now: number): void {
    const t = Date.parse(o.periodEnd);
    const v = o.pm25_now;
    if (!Number.isFinite(t) || typeof v !== "number") return;
    let list = this.crowd.get(o.stationId);
    if (!list) this.crowd.set(o.stationId, (list = []));
    if (!list.some((s) => s.t === t)) list.push({ t, v });
    const cut = now - 25 * HOUR;
    while (list.length && list[0].t < cut) list.shift();
  }

  /** Mean of the sensor's samples in (now − 60 min, now], or null with < MIN_SAMPLES. */
  crowdRolling1h(stationId: string, now: number): number | null {
    const s = (this.crowd.get(stationId) ?? []).filter((x) => x.t > now - HOUR && x.t <= now);
    if (s.length < MIN_SAMPLES) return null;
    return Math.round((s.reduce((a, x) => a + x.v, 0) / s.length) * 10) / 10;
  }

  /** Clock-hour means, keyed by hour END (to pair with hour-ending official values). */
  crowdHourly(stationId: string): Map<number, number> {
    const buckets = new Map<number, number[]>();
    for (const s of this.crowd.get(stationId) ?? []) {
      const end = Math.ceil(s.t / HOUR) * HOUR;
      if (!buckets.has(end)) buckets.set(end, []);
      buckets.get(end)!.push(s.v);
    }
    const out = new Map<number, number>();
    for (const [end, vs] of buckets) if (vs.length >= MIN_SAMPLES) out.set(end, vs.reduce((a, b) => a + b, 0) / vs.length);
    return out;
  }

  sizes() {
    return { officialStations: this.official.size, crowdSensors: this.crowd.size };
  }
}
