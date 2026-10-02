/**
 * The cron jobs. One trigger fires every minute; each minute runs ONE job (minute % 5), so every job runs every
 * 5 min and a single invocation does little enough work to fit the free plan's 10 ms CPU:
 *
 *   :x0/:x5  crowd   AirGradient map (one SEA bbox call) → per-country crowd slices; PH/LA/KH sets; at each new
 *                    hour, the hourly sensor log (sensor_hours) and the calibration hours; daily 90-day retention
 *   :x1/:x6  TH      Air4Thai (anchors for Thai community sensors; the web and apps read Air4Thai directly)
 *   :x2/:x7  MY + SG DOE APIMS; NEA v1 mirror (fallback) and the v2 mirror for /v1/sg/nea
 *   :x3/:x8  ID      BMKG, KLH ISPU, SiPongi
 *   :x4/:x9  VN      Hanoi moitruongthudo
 *
 * Each job polls only the sources that are DUE (the proxy's per-source TTLs and hourly budgets, poll.ts), rebuilds
 * its country's ObservationSet and stores it in D1 as the exact JSON the route serves. User requests never reach an
 * upstream. Composition mirrors services/proxy/src/countries.ts; the parsing is packages/core's adapters.
 */
import {
  SIPONGI_ATTRIBUTION,
  agMapObservations,
  air4thaiHistoryUrl,
  air4thaiObservations,
  biasFactor,
  biasFactor24h,
  bmkgObservations,
  countryAt,
  crowdQc,
  doeObservations,
  hanoiObservation,
  ispuObservations,
  mergeDoeUpdate,
  parseAir4ThaiHistory,
  parseAir4ThaiStations,
  parseHanoiSites,
  sgObservations,
  sipongiHotspots,
  type Attribution,
  type CountryCode,
  type Observation,
} from "../../../packages/core/src/countries/index.js";
import { haversineKm } from "../../../packages/core/src/math.js";
import { fromV1, type ApiResponse } from "../../../packages/core/src/parse.js";
import { sgtDate } from "../../../packages/core/src/format.js";
import type { RawResponses } from "../../../packages/core/src/client.js";
import { ANCHOR_RADIUS_KM, ATTRIBUTION } from "../../proxy/src/coverage.js";
import { Poller, SOURCES, URLS, type FetchLike, type SrcState } from "./poll.js";
import { HOUR, MIN_SAMPLES, hourKey, hourStats, pruneSamples, recordSample, ringPrune, ringRecord, rolling1h, withHistory, type OfficialRing, type SensorSamples } from "./rings.js";
import { K, kvGet, kvGetMany, kvPut, parseOr, type Env, type KvRow } from "./store.js";

export type JobName = "crowd" | "TH" | "MY" | "SG" | "ID" | "VN";
/** minute % 5 → jobs run in that minute. */
export const SCHEDULE: JobName[][] = [["crowd"], ["TH"], ["MY", "SG"], ["ID"], ["VN"]];
export const JOB_SOURCES: Record<JobName, string[]> = {
  crowd: ["crowd.airgradient"],
  TH: ["th.air4thai.aqi", "th.air4thai.history"],
  MY: ["my.doe"],
  SG: ["sg.nea.v1", "sg.nea.v2"],
  ID: ["id.bmkg", "id.klh.ispu", "id.sipongi"],
  VN: ["vn.hanoi.site", "vn.hanoi.stat", "vn.hanoi.aqi"],
};
/** Countries whose crowd slice the crowd job writes; PH/LA/KH are composed there directly (no anchors). */
export const CROWD_COUNTRIES: CountryCode[] = ["TH", "MY", "ID", "VN", "PH", "LA", "KH"];
const CROWD_ONLY: CountryCode[] = ["PH", "LA", "KH"];
/** Samples kept per sensor: a bit more than an hour, so a late cron run can still close the hour. */
export const SAMPLE_KEEP_MS = 75 * 60_000;
/** Crowd hourly means kept for calibration (the proxy's 25 h). */
export const CROWDH_KEEP_MS = 25 * HOUR;
/** Hourly-log retention. */
export const RETENTION_DAYS = 90;
/** Run the retention delete when closing this UTC hour (19:00 UTC = 03:00 in SG/MY). */
export const RETENTION_UTC_HOUR = 19;
/** An official set older than this is dropped (the proxy's keepMs, 6 h; MY: mergeDoeUpdate's 2 h 15 min). */
const OFFICIAL_KEEP_MS: Partial<Record<CountryCode, number>> = { MY: 8_100_000 };
const DEFAULT_KEEP_MS = 6 * HOUR;
const CROWD_KEEP_MS = SOURCES["crowd.airgradient"].keepMs;

export interface JobState {
  v: 1;
  sources: Record<string, SrcState>;
  lastRunAt: number | null;
  lastRunError: string | null;
  runs: number;
  /** When the stored official set was last rebuilt (country jobs), and how many stations it holds. */
  officialAt?: number | null;
  officialCount?: number;
  adapters?: string[];
  officialUnavailable?: string;
  notes?: string[];
  /** Per source, when its stored parsed data was fetched (for stale warnings and expiry). */
  dataAt?: Record<string, number>;
  /** Official stations (for /v1/sensors/{id}/uptime): [id, lat, lon, basis]. */
  stations?: [string, number, number, "1h" | "24h"][];
  /** Calibration per crowd sensor, recomputed once per closed hour: id → [k, qc]. */
  calib?: { hour: number; k: Record<string, [number | null, "ok" | "erratic"]> };
  /** Crowd job only. */
  crowdAt?: number | null;
  sensorsLogged?: number;
  lastClosedHour?: number;
  lastRetentionAt?: number;
}

export const newJobState = (): JobState => ({ v: 1, sources: {}, lastRunAt: null, lastRunError: null, runs: 0 });

export interface CrowdState {
  v: 1;
  /** Hour-ENDING ms of the last hour written to sensor_hours. */
  closedHour: number;
  /** First hour logged (for uptime denominators). */
  since: number | null;
  /** Memoised polygon lookups: "lat,lon" (4 dp) → country ("" = outside). */
  loc: Record<string, string>;
  sensors: Record<string, SensorSamples & { cc: string; lat: number; lon: number; indoor: boolean; seen: number }>;
}

export const newCrowdState = (): CrowdState => ({ v: 1, closedHour: 0, since: null, loc: {}, sensors: {} });

interface CrowdHourly {
  hour: number;
  /** id → [[hourEnd ms, mean], …] oldest → newest, 25 h. */
  s: Record<string, [number, number][]>;
}

export interface RunDeps {
  fetch: FetchLike;
  now: number;
  neaKey?: string;
}

const J = JSON.stringify;
const iso = (t: number) => new Date(t).toISOString();

/* ================================================================== entry */

export function jobsForMinute(now: number): JobName[] {
  return SCHEDULE[new Date(now).getUTCMinutes() % 5];
}

export async function runScheduled(env: Env, deps: RunDeps): Promise<void> {
  for (const job of jobsForMinute(deps.now)) await runJob(job, env, deps);
}

export async function runJob(job: JobName, env: Env, deps: RunDeps): Promise<void> {
  if (job === "crowd") return crowdJob(env, deps);
  if (job === "SG") return sgJob(env, deps);
  return countryJob(job, env, deps);
}

function loadState(row: KvRow | undefined): JobState {
  const s = parseOr<JobState>(row, newJobState());
  s.sources ??= {};
  return s;
}

function finishState(s: JobState, now: number, error: string | null = null) {
  s.lastRunAt = now;
  s.lastRunError = error;
  s.runs = (s.runs ?? 0) + 1;
}

/** The proxy's stale-if-error warning for a source, from a (possibly other job's) state. */
export function srcWarning(id: string, s: SrcState | undefined, dataAt: number | null | undefined, now: number): string | null {
  if (!s || s.lastErrorAt === null || (s.lastOkAt !== null && s.lastOkAt >= s.lastErrorAt)) return null;
  if (!dataAt) return `${id}: ${s.lastError}; nothing cached`;
  return `${id}: ${s.lastError}; serving data fetched ${Math.round((now - dataAt) / 60_000)} min ago`;
}

/* ================================================================== composing the served JSON */

/**
 * Placeholder for the country's official observations inside a stored set. The official list changes only when
 * its source is re-polled, so it is stored once (off:{cc}) and spliced in by the route (routes.ts resolveSet):
 * the 5-min compose never moves the big list through D1 again.
 */
export const OFFICIAL_REF = '"$official"';
const OFFICIAL_REF_ARRAY = `[${OFFICIAL_REF}]`;

/** Replace the placeholder with the stored official list's items (or nothing). */
export function spliceOfficial(setText: string, officialText: string | null | undefined): string {
  const items = officialText ? inner(officialText) : "";
  if (items) return setText.replace(OFFICIAL_REF, () => items);
  return setText.replace(`${OFFICIAL_REF},`, "").replace(OFFICIAL_REF, "");
}

const inner = (arrayText: string) => {
  const t = arrayText.trim();
  return t.length > 2 ? t.slice(1, -1) : "";
};

/**
 * The ObservationSet JSON, built from already-serialised parts (the official list is stored as text and never
 * re-parsed on the 5-min path). Key order matches the proxy's compose() + generatedAt.
 */
export function composeSet(p: {
  cc: CountryCode;
  adapters: string[];
  now: number;
  officialText: string;
  crowdText: string;
  attribution: Attribution[];
  hotspotsText?: string | null;
  warnings: string[];
  officialUnavailable?: string;
}): { status: number; body: string } {
  const parts = [inner(p.officialText), inner(p.crowdText)].filter(Boolean);
  if (!parts.length) {
    const body = { error: `No data available for ${p.cc} right now`, warnings: p.warnings, attribution: p.attribution };
    return { status: 503, body: J(body) };
  }
  let s = `{"country":${J(p.cc)},"adapters":${J(p.adapters)},"fetchedAt":${J(iso(p.now))},"observations":[${parts.join(",")}],"attribution":${J(p.attribution)}`;
  if (p.hotspotsText) s += `,"hotspots":${p.hotspotsText},"hotspotSource":${J(SIPONGI_ATTRIBUTION.text.replace(/^Hotspots: /, ""))}`;
  if (p.warnings.length) s += `,"warnings":${J(p.warnings)}`;
  if (p.officialUnavailable) s += `,"officialUnavailable":${J(p.officialUnavailable)}`;
  s += `,"generatedAt":${J(iso(p.now))}}`;
  return { status: 200, body: s };
}

/** ?grade=lowcost (the direct Thai adapter's call): community sensors only, their attribution only. */
export function composeLowcost(cc: CountryCode, crowdText: string, adapters: string[], warnings: string[], now: number): { status: number; body: string } {
  const obs = inner(crowdText);
  const ids = new Set<string>();
  for (const m of obs.matchAll(/"attributionId":"([^"]+)"/g)) ids.add(m[1]);
  const attribution = ATTRIBUTION[cc].filter((a) => ids.has(a.id));
  let s = `{"country":${J(cc)},"adapters":${J(adapters)},"fetchedAt":${J(iso(now))},"observations":[${obs}],"attribution":${J(attribution)}`;
  if (warnings.length) s += `,"warnings":${J(warnings)}`;
  s += `,"generatedAt":${J(iso(now))}}`;
  return { status: 200, body: s };
}

/* ================================================================== calibration */

/**
 * ARCHITECTURE_V2 §3 bias correction against the jurisdiction's anchor (nearest official station ≤ 10 km), as the
 * proxy's CountryService.calibrate: 1-hr anchors → median hourly ratio (biasFactor); MY → DOE implied 24-h PM2.5 vs
 * the sensor's 24-h mean (biasFactor24h). Computed once per closed hour, applied on every 5-min compose.
 */
export function computeCalib(
  crowd: readonly Observation[],
  anchors: readonly Observation[],
  kind: "1h" | "24h",
  hourly: CrowdHourly | null,
  now: number,
): Record<string, [number | null, "ok" | "erratic"]> {
  const out: Record<string, [number | null, "ok" | "erratic"]> = {};
  if (!anchors.length) return out;
  for (const o of crowd) {
    let near: Observation | null = null;
    let bd = Infinity;
    for (const a of anchors) {
      const d = haversineKm(o, a);
      if (d <= ANCHOR_RADIUS_KM && d < bd) {
        bd = d;
        near = a;
      }
    }
    if (!near) continue;
    const sensorHours = new Map(hourly?.s[o.stationId] ?? []);
    let r;
    if (kind === "1h") {
      const pairs: { anchor: number; sensor: number }[] = [];
      for (const h of near.history ?? []) {
        const t = hourKey(Date.parse(h.time));
        const s = sensorHours.get(t);
        if (h.pm25 !== null && h.pm25 !== undefined && s !== undefined) pairs.push({ anchor: h.pm25, sensor: s });
      }
      r = biasFactor(pairs);
    } else {
      const last24 = [...sensorHours.entries()].filter(([t]) => t > now - 24 * HOUR).map(([, v]) => v);
      r = biasFactor24h(near.pm25_24h ?? null, last24);
    }
    if (r.qc === "erratic") out[o.stationId] = [null, "erratic"];
    else if (r.k !== null) out[o.stationId] = [r.k, "ok"];
  }
  return out;
}

export function applyCalib(crowd: readonly Observation[], calib: JobState["calib"], now: number): Observation[] {
  const k = calib?.k ?? {};
  const out = crowd.map((o) => {
    const c = k[o.stationId];
    if (!c) return o;
    if (c[1] === "erratic") return { ...o, qc: "erratic" as const };
    const f = c[0]!;
    const scale = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * f * 10) / 10 : v);
    return { ...o, k: f, qc: "ok" as const, pm25_now: scale(o.pm25_now), pm25_1h: scale(o.pm25_1h) };
  });
  return crowdQc(out, now);
}

/* ================================================================== crowd job */

const networkOf = (id: string) => (id.startsWith("sc:") ? "sensor.community" : "airgradient");
const r3 = (x: number) => Math.round(x * 1000) / 1000;

async function crowdJob(env: Env, deps: RunDeps): Promise<void> {
  const { now } = deps;
  const db = env.DB;
  const rows = await kvGetMany(db, [K.job("crowd"), K.crowdState, ...CROWD_ONLY.map(K.crowdSlice)]);
  const state = loadState(rows.get(K.job("crowd")));
  const cs = parseOr<CrowdState>(rows.get(K.crowdState), newCrowdState());
  const poller = new Poller(state.sources, deps.fetch, now);
  const writes: D1PreparedStatement[] = [];
  const slices = new Map<CountryCode, Observation[]>();

  const got = await poller.poll<{ data?: { dataSource?: string; locationId?: number; rhum?: number | null }[] }>("crowd.airgradient", URLS.agMap());
  if (got) {
    const rh = new Map<string, number | null>();
    for (const r of got.data?.data ?? [])
      if (r && (r.dataSource === "AirGradient" || r.dataSource === "SensorCommunity"))
        rh.set(`${r.dataSource === "SensorCommunity" ? "sc" : "ag"}:${r.locationId}`, typeof r.rhum === "number" ? r.rhum : null);
    const loc: Record<string, string> = {};
    const locate = (lat: number, lon: number): CountryCode | null => {
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      const hit = cs.loc[key] ?? loc[key];
      const cc = hit !== undefined ? hit : countryAt(lat, lon) ?? "";
      loc[key] = cc;
      return (cc || null) as CountryCode | null;
    };
    const obs = agMapObservations(got.data, CROWD_COUNTRIES, locate);
    cs.loc = loc;
    for (const o of obs) {
      const s = (cs.sensors[o.stationId] ??= { t: [], v: [], rh: [], cc: o.country, lat: o.lat, lon: o.lon, indoor: !!o.indoor, seen: now });
      Object.assign(s, { cc: o.country, lat: o.lat, lon: o.lon, indoor: !!o.indoor, seen: now });
      const t = Date.parse(o.periodEnd);
      if (Number.isFinite(t) && typeof o.pm25_now === "number") recordSample(s, t, o.pm25_now, rh.get(o.stationId) ?? null);
    }
    for (const [id, s] of Object.entries(cs.sensors)) {
      pruneSamples(s, now - SAMPLE_KEEP_MS);
      if (!s.t.length && now - s.seen > SAMPLE_KEEP_MS) delete cs.sensors[id];
    }
    for (const cc of CROWD_COUNTRIES) slices.set(cc, []);
    for (const o of obs) {
      const m = rolling1h(cs.sensors[o.stationId], now);
      slices.get(o.country)?.push(m === null ? o : { ...o, pm25_1h: m });
    }
    for (const [cc, list] of slices) writes.push(kvPut(db, K.crowdSlice(cc), J(list), now));
    state.crowdAt = now;
  } else {
    for (const cc of CROWD_ONLY) slices.set(cc, parseOr<Observation[]>(rows.get(K.crowdSlice(cc)), []));
  }

  // PH, LA, KH: community sensors only, uncalibrated (no anchor), QC'd.
  const crowdFresh = !!state.crowdAt && now - state.crowdAt <= CROWD_KEEP_MS;
  const w = srcWarning("crowd.airgradient", state.sources["crowd.airgradient"], state.crowdAt, now);
  for (const cc of CROWD_ONLY) {
    const list = crowdFresh ? crowdQc(slices.get(cc) ?? [], now) : [];
    const set = composeSet({ cc, adapters: list.length || crowdFresh ? ["crowd.airgradient"] : [], now, officialText: "[]", crowdText: J(list), attribution: ATTRIBUTION[cc], warnings: w ? [w] : [] });
    writes.push(kvPut(db, K.set(cc), set.body, now, set.status));
  }

  // A new clock hour: log it (sensor_hours), and extend the calibration hours (crowdh:{cc}).
  const end = Math.floor(now / HOUR) * HOUR;
  if (end > cs.closedHour) {
    writes.push(...(await closeHour(db, cs, end, now)));
    state.lastClosedHour = end;
    state.sensorsLogged = Object.values(cs.sensors).filter((s) => !s.indoor).length;
    cs.closedHour = end;
    cs.since ??= end;
    if (new Date(end).getUTCHours() === RETENTION_UTC_HOUR) {
      const cut = Math.floor((end - RETENTION_DAYS * 24 * HOUR) / 1000);
      writes.push(db.prepare("DELETE FROM sensor_hours WHERE hour < ?1").bind(cut), db.prepare("DELETE FROM station_hours WHERE hour < ?1").bind(cut));
      state.lastRetentionAt = now;
    }
  }

  finishState(state, now, got ? null : state.sources["crowd.airgradient"]?.lastError ?? null);
  writes.push(kvPut(db, K.crowdState, J(cs), now), kvPut(db, K.job("crowd"), J(state), now));
  await db.batch(writes);
}

/** sensor_hours rows for the hour ending `end`, and the crowdh:{cc} updates. */
async function closeHour(db: D1Database, cs: CrowdState, end: number, now: number): Promise<D1PreparedStatement[]> {
  const hourSec = Math.floor(end / 1000);
  const logRows: (string | number | null)[][] = [];
  const hourly = new Map<string, CrowdHourly>();
  const prev = await kvGetMany(db, CROWD_COUNTRIES.map(K.crowdHourly));
  for (const cc of CROWD_COUNTRIES) {
    const h = parseOr<CrowdHourly>(prev.get(K.crowdHourly(cc)), { hour: 0, s: {} });
    h.hour = end;
    hourly.set(cc, h);
  }
  for (const [id, s] of Object.entries(cs.sensors)) {
    if (s.indoor) continue; // not used for any estimate: not logged
    const st = hourStats(s, end);
    const fresh = st.n >= MIN_SAMPLES ? 1 : 0;
    logRows.push([id, hourSec, networkOf(id), s.cc || null, r3(s.lat), r3(s.lon), st.pm25 === null ? null : Math.round(st.pm25 * 10) / 10, st.rh, st.n, fresh]);
    const h = hourly.get(s.cc as CountryCode);
    if (h && fresh && st.pm25 !== null) (h.s[id] ??= []).push([end, st.pm25]);
  }
  const out: D1PreparedStatement[] = [];
  for (const h of hourly.values())
    for (const [id, list] of Object.entries(h.s)) {
      const kept = list.filter(([t]) => t > now - CROWDH_KEEP_MS);
      if (kept.length) h.s[id] = kept;
      else delete h.s[id];
    }
  for (const [cc, h] of hourly) out.push(kvPut(db, K.crowdHourly(cc), J(h), now));
  for (let i = 0; i < logRows.length; i += 200)
    out.push(
      db
        .prepare(
          `INSERT INTO sensor_hours (id, hour, network, country, lat, lon, pm25, rh, n, fresh)
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                  json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'),
                  json_extract(value, '$[8]'), json_extract(value, '$[9]')
           FROM json_each(?1) WHERE 1
           ON CONFLICT(id, hour) DO NOTHING`,
        )
        .bind(J(logRows.slice(i, i + 200))),
    );
  return out;
}

/* ================================================================== country jobs (TH, MY, ID, VN) */

interface Refreshed {
  official: Observation[];
  /** Extra rows to write (per-source parsed lists, raw payloads, rings). */
  writes: D1PreparedStatement[];
}

interface CountryCtx {
  db: D1Database;
  now: number;
  poller: Poller;
  state: JobState;
  /** ID: SiPongi hotspots fetched in this run (JSON text). */
  hotText?: string;
}

/** Official stations → station_hours upserts (writes only when a value is new or revised). */
function stationUpserts(db: D1Database, cc: CountryCode, official: readonly Observation[]): D1PreparedStatement[] {
  const rows: (string | number | null)[][] = [];
  for (const o of official) {
    const t = Date.parse(o.periodEnd);
    if (!Number.isFinite(t) || (o.pm25_1h == null && o.pm25_24h == null)) continue;
    rows.push([o.stationId, Math.floor(hourKey(t) / 1000), cc, o.pm25_1h ?? null, o.pm25_24h ?? null]);
  }
  const out: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += 200)
    out.push(
      db
        .prepare(
          `INSERT INTO station_hours (id, hour, country, pm25, pm25_24h)
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[4]')
           FROM json_each(?1) WHERE 1
           ON CONFLICT(id, hour) DO UPDATE SET pm25 = excluded.pm25, pm25_24h = excluded.pm25_24h
           WHERE station_hours.pm25 IS NOT excluded.pm25 OR station_hours.pm25_24h IS NOT excluded.pm25_24h`,
        )
        .bind(J(rows.slice(i, i + 200))),
    );
  return out;
}

async function refreshTH(c: CountryCtx): Promise<Refreshed | null> {
  const aqi = await c.poller.poll("th.air4thai.aqi", URLS.thAqi());
  if (!aqi) return null;
  const stations = parseAir4ThaiStations(aqi.data);
  if (!stations.length) {
    c.state.adapters = [];
    c.state.officialUnavailable = "PCD Air4Thai";
    return { official: [], writes: [] };
  }
  // History follows the station list (same cadence); if it fails, keep the previous set (stale warning).
  if (!c.poller.allowed("th.air4thai.history")) return null;
  let hist;
  try {
    hist = await c.poller.fetch("th.air4thai.history", air4thaiHistoryUrl(stations.map((s) => s.stationID), c.now));
  } catch {
    return null;
  }
  c.state.adapters = ["th.air4thai"];
  c.state.officialUnavailable = undefined;
  return { official: air4thaiObservations(stations, parseAir4ThaiHistory(hist.data)), writes: [] };
}

async function refreshMY(c: CountryCtx): Promise<Refreshed | null> {
  const doe = await c.poller.poll("my.doe", URLS.myDoe());
  if (!doe) return null;
  const rows = await kvGetMany(c.db, [K.official("MY"), K.ring("MY")]);
  const prev = parseOr<Observation[]>(rows.get(K.official("MY")), []).map(({ history: _h, ...o }) => o as Observation);
  const ring = parseOr<OfficialRing>(rows.get(K.ring("MY")), {});
  let official = mergeDoeUpdate(prev, doeObservations(doe.data), c.now);
  for (const o of official) ringRecord(ring, o, c.now);
  ringPrune(ring, c.now);
  official = official.map((o) => withHistory(ring, o));
  c.state.adapters = ["my.doe"];
  c.state.officialUnavailable = official.length ? undefined : "DOE Malaysia";
  return { official, writes: [kvPut(c.db, K.ring("MY"), J(ring), c.now)] };
}

async function refreshID(c: CountryCtx): Promise<Refreshed | null> {
  const [bmkg, ispu, sip] = await Promise.all([
    c.poller.poll<string>("id.bmkg", URLS.idBmkg()),
    c.poller.poll("id.klh.ispu", URLS.idIspu()),
    c.poller.poll("id.sipongi", URLS.idSipongi()),
  ]);
  const writes: D1PreparedStatement[] = [];
  const dataAt = (c.state.dataAt ??= {});
  if (sip) {
    c.hotText = J(sipongiHotspots(sip.data));
    writes.push(kvPut(c.db, "hot:ID", c.hotText, c.now));
    dataAt["id.sipongi"] = c.now;
  }
  if (!bmkg && !ispu) {
    if (writes.length) await c.db.batch(writes);
    return null;
  }
  const rows = await kvGetMany(c.db, ["src:id.bmkg", "src:id.klh.ispu", K.ring("ID")]);
  const keep = (id: string) => dataAt[id] !== undefined && c.now - dataAt[id] <= DEFAULT_KEEP_MS;
  const notes: string[] = [];
  let b: Observation[];
  if (bmkg) {
    b = bmkgObservations(bmkg.data, bmkg.fetchedAt);
    if (!b.length) notes.push("id.bmkg: page layout changed (no __NUXT_DATA__ rows); 1-hr values unavailable");
    writes.push(kvPut(c.db, "src:id.bmkg", J(b), c.now));
    dataAt["id.bmkg"] = c.now;
  } else b = keep("id.bmkg") ? parseOr<Observation[]>(rows.get("src:id.bmkg"), []) : [];
  let k: Observation[];
  if (ispu) {
    k = ispuObservations(ispu.data, c.now);
    writes.push(kvPut(c.db, "src:id.klh.ispu", J(k), c.now));
    dataAt["id.klh.ispu"] = c.now;
  } else k = keep("id.klh.ispu") ? parseOr<Observation[]>(rows.get("src:id.klh.ispu"), []) : [];
  const ring = parseOr<OfficialRing>(rows.get(K.ring("ID")), {});
  const official = [...b, ...k];
  for (const o of official) ringRecord(ring, o, c.now);
  ringPrune(ring, c.now);
  writes.push(kvPut(c.db, K.ring("ID"), J(ring), c.now));
  c.state.notes = notes;
  c.state.adapters = [...(b.length ? ["id.bmkg"] : []), ...(k.length ? ["id.klh"] : [])];
  c.state.officialUnavailable = official.length ? undefined : "BMKG and KLH";
  return { official: official.map((o) => withHistory(ring, o)), writes };
}

async function refreshVN(c: CountryCtx): Promise<Refreshed | null> {
  const writes: D1PreparedStatement[] = [];
  const site = await c.poller.poll("vn.hanoi.site", URLS.vnSite());
  if (site) writes.push(kvPut(c.db, "raw:vn.hanoi.site", J(site.data), c.now));
  const siteRow = site ? null : await kvGet(c.db, "raw:vn.hanoi.site");
  const sites = parseHanoiSites(site ? site.data : parseOr<unknown>(siteRow, []));
  const recent = sites.filter((s) => {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.aqi_time ?? "");
    return !m || c.now - Date.parse(`${m[3]}-${m[2]}-${m[1]}T00:00:00+07:00`) < 2 * 24 * HOUR;
  });
  const due = recent.filter((s) => c.poller.due("vn.hanoi.stat", String(s.id)) || c.poller.due("vn.hanoi.aqi", String(s.id)));
  if (!due.length) {
    if (writes.length) await c.db.batch(writes);
    return null;
  }
  const cached = await kvGetMany(c.db, [K.official("VN"), ...due.flatMap((s) => [`raw:vn.hanoi.stat:${s.id}`, `raw:vn.hanoi.aqi:${s.id}`])]);
  const prev = new Map(parseOr<Observation[]>(cached.get(K.official("VN")), []).map((o) => [o.stationId, o]));
  let changed = false;
  for (const s of due) {
    const sub = String(s.id);
    const [stat, aqi] = await Promise.all([
      c.poller.poll("vn.hanoi.stat", URLS.vnStat(s.id), sub),
      c.poller.poll("vn.hanoi.aqi", URLS.vnAqi(s.id), sub),
    ]);
    if (stat) writes.push(kvPut(c.db, `raw:vn.hanoi.stat:${s.id}`, J(stat.data), c.now));
    if (aqi) writes.push(kvPut(c.db, `raw:vn.hanoi.aqi:${s.id}`, J(aqi.data), c.now));
    if (!stat && !aqi) continue;
    const o = hanoiObservation(
      s,
      stat ? stat.data : parseOr<unknown>(cached.get(`raw:vn.hanoi.stat:${s.id}`), null),
      aqi ? aqi.data : parseOr<unknown>(cached.get(`raw:vn.hanoi.aqi:${s.id}`), null),
      c.now,
    );
    if (o) {
      prev.set(o.stationId, o);
      changed = true;
    }
  }
  if (!changed) {
    if (writes.length) await c.db.batch(writes);
    return null;
  }
  const ids = new Set(recent.map((s) => `vn.hanoi:${s.id}`));
  const official = [...prev.values()].filter((o) => ids.has(o.stationId));
  c.state.adapters = official.length ? ["vn.hanoi"] : [];
  c.state.officialUnavailable = official.length ? undefined : "Hanoi's monitoring centre";
  return { official, writes };
}

const REFRESH: Record<"TH" | "MY" | "ID" | "VN", (c: CountryCtx) => Promise<Refreshed | null>> = { TH: refreshTH, MY: refreshMY, ID: refreshID, VN: refreshVN };
const CALIB_KIND: Record<"TH" | "MY" | "ID" | "VN", "1h" | "24h"> = { TH: "1h", MY: "24h", ID: "1h", VN: "1h" };

async function countryJob(cc: "TH" | "MY" | "ID" | "VN", env: Env, deps: RunDeps): Promise<void> {
  const { now } = deps;
  const db = env.DB;
  const rows = await kvGetMany(db, [K.job(cc), K.job("crowd"), K.crowdSlice(cc), ...(cc === "ID" ? ["hot:ID"] : [])]);
  const state = loadState(rows.get(K.job(cc)));
  const crowdState = loadState(rows.get(K.job("crowd")));
  const poller = new Poller(state.sources, deps.fetch, now);
  const c: CountryCtx = { db, now, poller, state };
  const writes: D1PreparedStatement[] = [];
  let error: string | null = null;

  let refreshed: Refreshed | null = null;
  try {
    refreshed = await REFRESH[cc](c);
  } catch (e) {
    error = (e as Error).message;
  }

  const crowdFresh = !!crowdState.crowdAt && now - crowdState.crowdAt <= CROWD_KEEP_MS;
  const crowdRaw = crowdFresh ? parseOr<Observation[]>(rows.get(K.crowdSlice(cc)), []) : [];

  let officialText: string;
  /** When the official data we serve was fetched (null: none served). */
  let servedAt: number | null = null;
  if (refreshed) {
    servedAt = now;
    state.officialAt = now;
    state.officialCount = refreshed.official.length;
    officialText = refreshed.official.length ? OFFICIAL_REF_ARRAY : "[]";
    writes.push(...refreshed.writes, kvPut(db, K.official(cc), J(refreshed.official), now), ...stationUpserts(db, cc, refreshed.official));
    state.stations = refreshed.official.map((o) => [o.stationId, o.lat, o.lon, o.pm25_1h != null ? "1h" : "24h"]);
    // Once per closed hour (the crowd job's crowdh:{cc}), recompute the sensors' calibration against these anchors.
    const hourly = parseOr<CrowdHourly | null>(await kvGet(db, K.crowdHourly(cc)), null);
    if (hourly && hourly.hour > (state.calib?.hour ?? 0)) {
      const anchors = cc === "ID" ? refreshed.official.filter((o) => o.stationId.startsWith("id.bmkg:")) : refreshed.official;
      state.calib = { hour: hourly.hour, k: computeCalib(crowdRaw, anchors, CALIB_KIND[cc], hourly, now) };
    }
  } else {
    const keepMs = OFFICIAL_KEEP_MS[cc] ?? DEFAULT_KEEP_MS;
    const fresh = state.officialAt && now - state.officialAt <= keepMs;
    // The official list (TH: 365 KB) is never re-read here: the route splices it in (OFFICIAL_REF).
    officialText = fresh && (state.officialCount ?? 1) > 0 ? OFFICIAL_REF_ARRAY : "[]";
    servedAt = fresh ? state.officialAt! : null;
    if (!fresh && state.officialAt) {
      state.adapters = [];
      state.officialUnavailable = { TH: "PCD Air4Thai", MY: "DOE Malaysia", ID: "BMKG and KLH", VN: "Hanoi's monitoring centre" }[cc];
    }
  }

  const crowd = applyCalib(crowdRaw, state.calib, now);
  const crowdText = J(crowd);
  const warnings: string[] = [];
  for (const id of JOB_SOURCES[cc]) {
    const w = poller.warning(id, id === "id.sipongi" ? state.dataAt?.[id] ?? null : servedAt);
    if (w) warnings.push(w);
  }
  warnings.push(...(state.notes ?? []));
  const cw = srcWarning("crowd.airgradient", crowdState.sources["crowd.airgradient"], crowdState.crowdAt, now);
  if (cw) warnings.push(cw);
  const hot = cc === "ID" && state.dataAt?.["id.sipongi"] && now - state.dataAt["id.sipongi"] <= SOURCES["id.sipongi"].keepMs ? c.hotText ?? rows.get("hot:ID")?.v ?? null : null;
  const set = composeSet({
    cc,
    adapters: [...(state.adapters ?? []), ...(hot ? ["id.sipongi"] : []), ...(crowdFresh ? ["crowd.airgradient"] : [])],
    now,
    officialText,
    crowdText,
    attribution: ATTRIBUTION[cc],
    hotspotsText: hot,
    warnings,
    officialUnavailable: state.officialUnavailable,
  });
  writes.push(kvPut(db, K.set(cc), set.body, now, set.status));
  if (cc === "TH") {
    const low = composeLowcost("TH", crowdText, crowdFresh ? ["crowd.airgradient"] : [], cw ? [cw] : [], now);
    writes.push(kvPut(db, K.setLowcost("TH"), low.body, now, low.status));
  }
  finishState(state, now, error);
  writes.push(kvPut(db, K.job(cc), J(state), now));
  await db.batch(writes);
}

/* ================================================================== SG (NEA mirror, fallback only) */

async function sgJob(env: Env, deps: RunDeps): Promise<void> {
  const { now } = deps;
  const db = env.DB;
  const rows = await kvGetMany(db, [K.job("SG"), K.sgRaw]);
  const state = loadState(rows.get(K.job("SG")));
  const poller = new Poller(state.sources, deps.fetch, now, (src): Record<string, string> =>
    deps.neaKey && src.id === "sg.nea.v2" ? { "x-api-key": deps.neaKey } : {},
  );
  const writes: D1PreparedStatement[] = [];
  const today = sgtDate(now);
  const [pm, psi] = await Promise.all([
    poller.poll("sg.nea.v1", URLS.neaV1("pm25", today), "pm25"),
    poller.poll("sg.nea.v1", URLS.neaV1("psi", today), "psi"),
  ]);
  let raw = parseOr<RawResponses | null>(rows.get(K.sgRaw), null);
  if (pm || psi) {
    // The proxy's sgRaw(): today's v1 series; empty → v1 latest; still empty → v2 today.
    let pm1: ApiResponse | null = pm ? fromV1(pm.data) : raw?.v1Pm25[0] ?? null;
    let psi1: ApiResponse | null = psi ? fromV1(psi.data) : raw?.v1Psi[0] ?? null;
    const tryGet = async (id: string, url: string, sub: string) => (poller.allowed(id) ? poller.fetch(id, url, sub).catch(() => null) : null);
    if (!pm1?.data?.items?.length) pm1 = fromV1((await tryGet("sg.nea.v1", URLS.neaV1("pm25"), "pm25-latest"))?.data ?? null);
    if (!psi1?.data?.items?.length) psi1 = fromV1((await tryGet("sg.nea.v1", URLS.neaV1("psi"), "psi-latest"))?.data ?? null);
    raw = { v1Pm25: [pm1], v1Psi: [psi1], pm25Latest: null, pm25Days: [], psi: null, psiDays: [] };
    if (!pm1?.data?.items?.length) {
      const v2 = await tryGet("sg.nea.v2", URLS.neaV2("pm25", today), "pm25-today");
      if (v2) raw = { v1Pm25: [], v1Psi: [psi1], pm25Latest: null, pm25Days: [fromV1(v2.data)], psi: null, psiDays: [] };
    }
    state.officialAt = now;
    writes.push(kvPut(db, K.sgRaw, J(raw), now));
  }
  const fresh = raw && state.officialAt && now - state.officialAt <= SOURCES["sg.nea.v1"].keepMs;
  const warnings = ["sg.nea.v1"].map((id) => poller.warning(id, state.officialAt ?? null)).filter((x): x is string => !!x);
  const set = composeSet({
    cc: "SG",
    adapters: fresh ? ["sg.nea"] : [],
    now,
    officialText: fresh ? J(sgObservations(raw!)) : "[]",
    crowdText: "[]",
    attribution: ATTRIBUTION.SG,
    warnings,
  });
  writes.push(kvPut(db, K.set("SG"), set.body, now, set.status));

  // /v1/sg/nea/{pm25|psi}: the latest v2 payloads, every 15 min.
  for (const kind of ["pm25", "psi"] as const) {
    const g = await poller.poll("sg.nea.v2", URLS.neaV2(kind), kind);
    if (g) writes.push(kvPut(db, K.nea(kind), J(g.data), now));
  }
  finishState(state, now, null);
  writes.push(kvPut(db, K.job("SG"), J(state), now));
  await db.batch(writes);
}
