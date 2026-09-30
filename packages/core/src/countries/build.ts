/**
 * ObservationSet + location → CountrySnapshot. Pure and deterministic (same rules in TS/Swift/Kotlin).
 * Runs on the device: the location never has to leave it (REGIONAL §4.1).
 *
 * Rules (SPEC v2.0):
 *  1. Only observations whose `country` equals the set's jurisdiction are used. Official values are never
 *     interpolated across a border.
 *  2. Big number, in order:
 *     a. official 1-hr PM2.5 if the nearest fresh official station is ≤ 25 km away;
 *     b. else a crowd estimate from usable community sensors ≤ 10 km away;
 *     c. else official 1-hr PM2.5 up to 60 km away (flag "nearest_far");
 *     d. else null (flag "no_official_1h" / "no_reading_nearby").
 *     Official: IDW (power 2, haversine) over the nearest station plus any within 1.5× its distance (max 5, ≤ 60 km),
 *     all at the same hour; < 0.5 km snaps. Crowd: IDW over sensors ≤ 10 km. Rounded half up to an integer.
 *  3. Official index row: the nearest station (≤ 60 km) that publishes one, verbatim. Never interpolated.
 *  4. Chip: the jurisdiction's scale (scales.ts). basis "pm25_1h" classifies the big number; "official_index"
 *     classifies the published index. No scale → no chip, no level.
 *  5. Stale: observedAt older than 2 h 15 min. Stations older than that are dropped while fresher ones exist.
 *  0. Quality screens first (quality.ts): a station offline for more than 24 h, or with an implausible reading
 *     (outside 0–1000 µg/m³, or a rise of more than 400 in an hour), is left out entirely. Notes "offline_dropped"
 *     (a reference station ≤ 25 km that would have been the nearest) and "implausible_dropped" (any station ≤ 60 km) let the client say so calmly.
 *  6. query.withinKm (catalogue destinations): nothing beyond that radius is used for the number, the index row or the
 *     stations list, and freshness is judged inside it (a stale station next door beats a fresh one 60 km away).
 */
import { STALE_AFTER_MS } from "../constants.js";
import { haversineKm, isValidReading, roundHalfUp, trend } from "../math.js";
import type { HistoryPoint, LatLon, RegionReading } from "../types.js";
import { usableCrowd } from "./crowd.js";
import { screenObservations } from "./quality.js";
import { msToIso } from "./time.js";
import { COUNTRIES } from "./registry.js";
import { CHIP_SCALE, classifyIndex, classifyPm25, getScale, levelBand, toLocalBand, whoMultiple } from "./scales.js";
import type {
  CountryCode,
  CountryQuery,
  CountrySnapshot,
  HotspotContext,
  LocalBand,
  Observation,
  ObservationSet,
  OfficialIndex,
  StationSummary,
} from "./types.js";

export const OFFICIAL_PREFERRED_KM = 25;
export const OFFICIAL_MAX_KM = 60;
export const CROWD_RADIUS_KM = 10;
export const SNAP_KM = 0.5;
export const HOTSPOT_RADIUS_KM = 100;
const HOUR = 3600_000;

/** The official source failed and nothing else is in range: show the last cached reading, or a calm "can't reach" state. */
export class OfficialUnavailableError extends Error {
  constructor(public country: CountryCode, public source: string) {
    super(`${source} isn't responding and no community sensor is in range`);
    this.name = "OfficialUnavailableError";
  }
}

export class NoCountryDataError extends Error {
  constructor(message = "No usable observations for this location") {
    super(message);
    this.name = "NoCountryDataError";
  }
}

interface Ranked {
  o: Observation;
  d: number;
}

const valueOf = (o: Observation): number | null => {
  const v = o.pm25_1h ?? o.pm25_now ?? null;
  return isValidReading(v) ? v : null;
};

function summary(r: Ranked): StationSummary {
  return {
    stationId: r.o.stationId,
    name: r.o.name,
    distanceKm: Math.round(r.d * 10) / 10,
    grade: r.o.grade,
    pm25_1h: r.o.pm25_1h ?? r.o.pm25_now ?? null,
    official: r.o.official ?? null,
    periodEnd: r.o.periodEnd,
  };
}

/** Value of a station at hour-ending time t (from its history, or its latest value if that is hour t). */
function valueAt(o: Observation, t: number): number | null {
  const h = o.history?.find((x) => Date.parse(x.time) === t);
  if (h) return isValidReading(h.pm25) ? h.pm25 : null;
  if (Date.parse(o.periodEnd) === t) return valueOf(o);
  return null;
}

function idw(pts: { v: number; d: number }[]): number {
  if (pts[0].d < SNAP_KM) return pts[0].v;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    const w = 1 / (p.d * p.d);
    num += w * p.v;
    den += w;
  }
  return num / den;
}

/** SPEC v1.7 range: stations within 1.5× the nearest's distance (at least two), widened to contain the estimate. */
function rangeOf(pool: { v: number; d: number }[], estimate: number): [number, number] | null {
  if (pool.length === 0) return null;
  const limit = pool[0].d * 1.5;
  const vals = pool.filter((p, i) => i < 2 || p.d <= limit).map((p) => roundHalfUp(p.v));
  const r: [number, number] = [Math.min(...vals, estimate), Math.max(...vals, estimate)];
  return r[0] === r[1] ? null : r;
}

/** Instant rendered in the same UTC offset as `sample` ("…+07:00"), so history reads in station-local time. */
function sameOffset(ms: number, sample: string): string {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(sample);
  if (!m) return new Date(ms).toISOString();
  const off = (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
  return msToIso(ms, off);
}

function hourKey(t: number): number {
  return Math.round(t / HOUR) * HOUR;
}

export function buildCountrySnapshot(set: ObservationSet, query: CountryQuery = {}, now: Date | number = Date.now()): CountrySnapshot {
  const t = typeof now === "number" ? now : now.getTime();
  const cc = set.country;
  const meta = COUNTRIES[cc];
  const notes: string[] = [];
  if (set.officialUnavailable) notes.push("official_unavailable");
  const own = set.observations.filter((o) => o.country === cc);
  if (own.length !== set.observations.length) notes.push("other_country_dropped");
  const screened = screenObservations(own, t);
  const obs = screened.kept;

  // Where are we?
  let point: LatLon;
  let locationMode: CountrySnapshot["locationMode"] = "gps";
  const pinned = query.station ? obs.find((o) => o.stationId === query.station) : undefined;
  if (typeof query.lat === "number" && typeof query.lon === "number" && Number.isFinite(query.lat) && Number.isFinite(query.lon)) {
    point = { lat: query.lat, lon: query.lon };
  } else if (pinned) {
    point = { lat: pinned.lat, lon: pinned.lon };
    locationMode = "region";
  } else {
    point = { lat: meta.defaultPlace.lat, lon: meta.defaultPlace.lon };
    locationMode = "region";
    notes.push("default_place");
  }

  // Only worth saying when the silent station would have been the nearest one (Bangkok has 78: one silent isn't news).
  const nearestKept = Math.min(Infinity, ...obs.filter((o) => o.grade === "reference").map((o) => haversineKm(point, o)));
  if (screened.offline.some((o) => o.grade === "reference" && haversineKm(point, o) <= Math.min(OFFICIAL_PREFERRED_KM, nearestKept))) notes.push("offline_dropped");
  if (screened.implausible.some((o) => haversineKm(point, o) <= OFFICIAL_MAX_KM)) notes.push("implausible_dropped");

  const ranked = (list: Observation[]): Ranked[] =>
    list.map((o) => ({ o, d: haversineKm(point, o) })).sort((a, b) => a.d - b.d || a.o.stationId.localeCompare(b.o.stationId));
  const fresh = (o: Observation) => t - Date.parse(o.periodEnd) <= STALE_AFTER_MS;
  const preferFresh = (list: Observation[]) => {
    const f = list.filter(fresh);
    if (f.length && f.length < list.length) notes.push("stale_stations_dropped");
    return f.length ? f : list;
  };

  // Destination radius (query.withinKm): drop everything beyond it before judging freshness.
  const within = typeof query.withinKm === "number" && query.withinKm > 0 ? query.withinKm : Infinity;
  const near = (list: Observation[]) => (within === Infinity ? list : list.filter((o) => haversineKm(point, o) <= within));
  if (within !== Infinity) notes.push("within_radius");

  const official1h = ranked(preferFresh(near(obs.filter((o) => o.grade === "reference" && isValidReading(o.pm25_1h)))));
  const crowd = ranked(obs.filter((o) => usableCrowd(o) && valueOf(o) !== null && fresh(o))).filter((r) => r.d <= Math.min(CROWD_RADIUS_KM, within));

  // 2. Big number source.
  let kind: CountrySnapshot["pm25Kind"] = null;
  let pool: Ranked[] = [];
  const n0 = official1h[0];
  if (n0 && n0.d <= OFFICIAL_PREFERRED_KM) kind = "official_1h";
  else if (crowd.length) kind = "crowd_estimate";
  else if (n0 && n0.d <= OFFICIAL_MAX_KM) {
    kind = "official_1h";
    notes.push("nearest_far");
  } else notes.push(official1h.length || obs.some((o) => o.grade === "reference") ? "no_reading_nearby" : "no_official_1h");
  if (!official1h.length && obs.some((o) => o.official)) notes.push("no_official_1h");

  if (kind === "official_1h") {
    const limit = Math.max(n0.d * 1.5, SNAP_KM);
    pool = official1h.filter((r, i) => (i === 0 || r.d <= limit) && r.d <= OFFICIAL_MAX_KM).slice(0, 5);
    if (pinned && pinned.grade === "reference" && isValidReading(pinned.pm25_1h)) pool = [{ o: pinned, d: 0 }];
  } else if (kind === "crowd_estimate") {
    pool = crowd.slice(0, 8);
    notes.push("crowd_only");
  }

  // Align the pool on one hour: the newest hour the nearest station has (official) / latest readings (crowd).
  let pm25: number | null = null;
  let observedAt: string;
  let publishedAt: string;
  let used: { v: number; d: number; o: Observation }[] = [];
  if (kind === "official_1h") {
    const H = hourKey(Date.parse(pool[0].o.periodEnd));
    used = pool.map((r) => ({ v: valueAt(r.o, H) ?? NaN, d: r.d, o: r.o })).filter((x) => Number.isFinite(x.v));
    if (!used.length) used = [{ v: valueOf(pool[0].o)!, d: pool[0].d, o: pool[0].o }];
    pm25 = roundHalfUp(idw(used));
    observedAt = pool[0].o.periodEnd;
    publishedAt = pool[0].o.publishedAt ?? observedAt;
  } else if (kind === "crowd_estimate") {
    used = pool.map((r) => ({ v: valueOf(r.o)!, d: r.d, o: r.o }));
    pm25 = roundHalfUp(idw(used));
    const newest = pool.reduce((a, b) => (Date.parse(b.o.periodEnd) > Date.parse(a.o.periodEnd) ? b : a));
    observedAt = newest.o.periodEnd;
    publishedAt = newest.o.publishedAt ?? observedAt;
  } else {
    const any = ranked(preferFresh(near(obs)))[0] ?? ranked(preferFresh(obs))[0];
    if (!any && set.officialUnavailable) throw new OfficialUnavailableError(cc, set.officialUnavailable);
    if (!any) throw new NoCountryDataError(`No observations for ${cc}`);
    observedAt = any.o.periodEnd;
    publishedAt = any.o.publishedAt ?? observedAt;
  }

  // 3. Official index row: nearest station publishing one, verbatim.
  const withIndex = ranked(preferFresh(near(obs.filter((o) => o.official && o.grade === "reference"))));
  let official: OfficialIndex | null = null;
  let officialStation: Ranked | undefined;
  if (pinned?.official) officialStation = { o: pinned, d: 0 };
  else if (withIndex[0] && withIndex[0].d <= OFFICIAL_MAX_KM) officialStation = withIndex[0];
  else if (withIndex[0]) notes.push("official_far");
  if (officialStation) official = officialStation.o.official ?? null;
  // Official source down and nothing honest to show here: the client falls back to its cache (never a far sensor).
  if (kind === null && !officialStation && set.officialUnavailable) throw new OfficialUnavailableError(cc, set.officialUnavailable);
  if (officialStation && kind === null) {
    observedAt = officialStation.o.periodEnd;
    publishedAt = officialStation.o.publishedAt ?? observedAt;
  }
  const pm25_24h = officialStation?.o.pm25_24h ?? (kind === "official_1h" ? pool[0].o.pm25_24h ?? null : null);

  // 4. Chip.
  const scaleId = CHIP_SCALE[cc];
  let localBand: LocalBand | null = null;
  let bandBasis: CountrySnapshot["bandBasis"] = "none";
  if (scaleId && getScale(scaleId).role === "chip") {
    const scale = getScale(scaleId);
    if (scale.basis === "pm25_1h" && pm25 !== null) {
      const b = classifyPm25(scaleId, pm25);
      if (b) {
        localBand = toLocalBand(scaleId, b);
        bandBasis = "pm25_1h";
      }
    }
    if (!localBand && official && official.scaleId === scaleId) {
      const b = classifyIndex(scaleId, official.value);
      if (b) {
        localBand = toLocalBand(scaleId, b);
        bandBasis = "official_index";
      }
    }
    // A community estimate with no official index to band it (Pai, Bangkok while Air4Thai is down): the authority's
    // category for the estimate, so the headline can still answer "is it OK to be out?" (flagged, shown as an estimate).
    if (!localBand && kind === "crowd_estimate" && pm25 !== null) {
      const b = classifyPm25(scaleId, pm25);
      if (b) {
        localBand = toLocalBand(scaleId, b);
        bandBasis = "pm25_1h";
      }
    }
  }
  const bandFromEstimate = !!localBand && bandBasis === "pm25_1h" && kind === "crowd_estimate";
  const level = localBand?.level ?? null;

  // History at the spot (same stations, same method), plus the authority's 24-h line where it exists.
  const history: HistoryPoint[] = [];
  if (kind) {
    const times = new Set<number>();
    for (const r of pool) for (const h of r.o.history ?? []) times.add(hourKey(Date.parse(h.time)));
    const end = hourKey(Date.parse(observedAt));
    if (kind === "official_1h") times.add(end);
    const lineSrc = officialStation?.o.history?.some((h) => h.pm25Avg24h != null) ? officialStation.o : pool[0].o;
    for (const tt of [...times].filter((x) => x <= end && x > end - 24 * HOUR).sort((a, b) => a - b)) {
      const pts = pool.map((r) => ({ v: valueAt(r.o, tt) ?? NaN, d: r.d })).filter((x) => Number.isFinite(x.v));
      if (!pts.length) continue;
      const v = tt === end && pm25 !== null && kind === "official_1h" ? pm25 : roundHalfUp(idw(pts));
      const line = lineSrc.history?.find((h) => hourKey(Date.parse(h.time)) === tt)?.pm25Avg24h ?? null;
      history.push({ time: sameOffset(tt, observedAt), pm25: v, pm25Avg24h: line });
    }
    if (kind === "crowd_estimate" && pm25 !== null && !history.length) history.push({ time: observedAt, pm25 });
  }
  const prev = history.find((h) => Date.parse(h.time) === hourKey(Date.parse(observedAt)) - HOUR);
  const tr = pm25 !== null ? trend(pm25, prev?.pm25 ?? null) : { delta: 0, direction: "steady" as const };

  // Range (SPEC v1.7): exact when snapped/pinned official; always for crowd.
  let range: [number, number] | null = null;
  if (pm25 !== null && used.length) {
    const sorted = [...used].sort((a, b) => a.d - b.d);
    const exact = kind === "official_1h" && (sorted[0].d < SNAP_KM || locationMode === "region");
    const far = sorted[0].d > 5;
    const disagree = sorted.length > 1 && Math.abs(sorted[0].v - sorted[1].v) > 30;
    if (!exact && (kind === "crowd_estimate" || far || disagree)) range = rangeOf(sorted, pm25);
  }

  // Stations list (same country only), nearest first.
  const stationsRanked = ranked(near(obs.filter((o) => o.grade === "reference" || usableCrowd(o)))).slice(0, 10);
  const regions: Record<string, RegionReading> = {};
  for (const r of stationsRanked) {
    regions[r.o.stationId] = {
      pm25: r.o.pm25_1h ?? r.o.pm25_now ?? null,
      psi24h: r.o.official?.value ?? null,
      lat: r.o.lat,
      lon: r.o.lon,
    };
  }
  const nearestUsed = kind ? pool[0] : officialStation ?? stationsRanked[0];

  // Context: fire hotspots near the spot (ID SiPongi).
  let hotspots: HotspotContext | null = null;
  if (set.hotspots && set.hotspotSource) {
    const count = set.hotspots.filter((h) => haversineKm(point, h) <= HOTSPOT_RADIUS_KM).length;
    hotspots = { count, radiusKm: HOTSPOT_RADIUS_KM, hours: 24, confidence: "high", source: set.hotspotSource };
  }

  const usedAttr = new Set<string>();
  for (const u of used) usedAttr.add(u.o.attributionId);
  if (officialStation) usedAttr.add(officialStation.o.attributionId);
  if (hotspots) for (const a of set.attribution) if (a.text.startsWith("Hotspots")) usedAttr.add(a.id);
  const attribution = set.attribution.filter((a) => usedAttr.has(a.id));

  const stale = t - Date.parse(observedAt) > STALE_AFTER_MS;
  return {
    pm25,
    band: levelBand(level),
    officialPsi24h: null,
    trend: tr,
    history,
    regions,
    nearestRegion: nearestUsed?.o.stationId ?? "",
    locationMode,
    observedAt,
    publishedAt,
    stale,
    source: attribution.map((a) => a.text.replace(/^(Data|Community sensors|Hotspots): /, "")).join(" · "),
    country: cc,
    status: meta.status,
    level,
    localBand,
    bandBasis,
    bandFromEstimate,
    official,
    pm25Kind: kind,
    pm25_24h,
    nearest: nearestUsed ? summary(nearestUsed) : null,
    stations: stationsRanked.map(summary),
    range,
    whoMultiple: whoMultiple(pm25),
    hotspots,
    attribution,
    notes: [...new Set(notes)],
  };
}
