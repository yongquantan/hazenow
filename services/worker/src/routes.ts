/**
 * HTTP routes: services/proxy's API, response shapes and headers, served from what the cron jobs stored in D1.
 * No route ever calls an upstream.
 *
 *   GET /health                          per-source status, the cron schedule and the daily budget
 *   GET /v1/countries                    coverage registry
 *   GET /v1/scales                       band-scale registry
 *   GET /v1/{cc}/observations            normalised ObservationSet — preferred: no location sent
 *   GET /v1/{cc|auto}/snapshot?lat&lon   built snapshot for dumb clients; coordinates rounded to 2 dp, never logged
 *   GET /v1/sg/nea/{pm25|psi}            the latest NEA v2 payload (mirrored every 15 min; no historical dates)
 *   GET /v1/sensors/{id}/uptime          a community sensor's 7/30-day uptime and agreement (new in the Worker)
 *   POST|GET /v1/hit?e=<event>&<dim>=<value>   +1 on an allow-listed (day, event, dims, country) counter (metrics.ts); 204
 *   GET /v1/stats?days=30[&refresh=github]   all counters, the funnel and the GitHub archive; needs `Authorization: Bearer <STATS_TOKEN>`
 *   GET /dash                            the private metrics dashboard (static page; it asks for the token; noindex)
 *
 * Usage counting (usage.ts): every /v1/* request adds 1 to a (UTC day, country, endpoint label) counter. Counts
 * only: no IP, user agent, coordinate, query string or identifier is stored.
 *
 * Every response: CORS *, JSON, and an `attribution` array clients must render. Nothing is logged: no IPs, no
 * query strings, no coordinates (observability samples only the Worker's own invocations, and path-only).
 */
import {
  COUNTRIES,
  OfficialUnavailableError,
  SCALES,
  buildCountrySnapshot,
  countryAt,
  countryVerdict,
  fromSgSnapshot,
  officialLine,
  type CountryCode,
  type CountrySnapshot,
  type ObservationSet,
} from "../../../packages/core/src/countries/index.js";
import { buildSnapshot } from "../../../packages/core/src/snapshot.js";
import { normaliseProfile, type Profile } from "../../../packages/core/src/experience.js";
import { sgtDate } from "../../../packages/core/src/format.js";
import type { RawResponses } from "../../../packages/core/src/client.js";
import { ALL_ATTRIBUTION, ATTRIBUTION, SERVED } from "../../proxy/src/coverage.js";
import { JOB_SOURCES, OFFICIAL_REF, SCHEDULE, spliceOfficial, type CrowdState, type JobState } from "./jobs.js";
import { SOURCES, sourceHealth } from "./poll.js";
import { K, kvGet, kvGetMany, kvPrefix, parseOr, type Env, type KvRow } from "./store.js";
import { SENSOR_ID, sensorUptime } from "./uptime.js";
import { budget } from "./budget.js";
import { countRequest, clearUsageBuffer, countryCode, endpointLabel, flushUsage, sameSecret } from "./usage.js";
import { countHit } from "./metrics.js";
import { readAllStats } from "./stats.js";
import { githubSnapshot } from "./github.js";
import { dashPage } from "./dash.js";

export const VERSION = "0.2.0";

export interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "access-control-max-age": "86400",
};

function json(status: number, body: unknown, cache = "public, max-age=30, stale-while-revalidate=300", extra: Record<string, string> = {}): Res {
  return raw(status, typeof body === "string" ? body : JSON.stringify(body), cache, extra);
}

function raw(status: number, body: string, cache: string, extra: Record<string, string> = {}): Res {
  return {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff", ...extra },
    body,
  };
}

const err = (status: number, message: string, attribution: unknown = ALL_ATTRIBUTION, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  json(status, { error: message, ...extra, attribution }, "no-store", headers);

/** Round to 2 dp (~1 km): the server never sees a precise location (SPEC v1.4 §5). */
export const coarse = (x: number) => Math.round(x * 100) / 100;

/** The set's community sensors only, with their attribution (the proxy's lowcostOnly). */
export function lowcostOnly(set: ObservationSet): ObservationSet {
  const observations = set.observations.filter((o) => o.grade === "lowcost");
  const ids = new Set(observations.map((o) => o.attributionId));
  return { ...set, observations, attribution: set.attribution.filter((a) => ids.has(a.id)), hotspots: undefined, hotspotSource: undefined };
}

/* ------------------------------------------------------------------ per-isolate caches (nothing personal) */

/** D1 rows reused for a few seconds within an isolate (the jobs rewrite them every 5 min). */
const memo = new Map<string, { at: number; row: KvRow | null }>();
export const MEMO_MS = 20_000;

async function cachedRow(db: D1Database, k: string, now: number): Promise<KvRow | null> {
  const hit = memo.get(k);
  if (hit && now - hit.at < MEMO_MS) return hit.row;
  const row = await kvGet(db, k);
  memo.set(k, { at: now, row });
  if (memo.size > 64) memo.delete(memo.keys().next().value as string);
  return row;
}

/** A stored set with its official list spliced in (see jobs.ts OFFICIAL_REF). */
async function setRow(db: D1Database, k: string, cc: CountryCode, now: number): Promise<KvRow | null> {
  const row = await cachedRow(db, k, now);
  if (!row || row.status !== 200 || !row.v.includes(OFFICIAL_REF)) return row;
  const off = await cachedRow(db, K.official(cc), now);
  return { ...row, v: spliceOfficial(row.v, off?.v) };
}

export function clearMemo() {
  memo.clear();
  hits.clear();
  clearUsageBuffer();
}

/** Per-isolate, per-IP soft rate limit (as the proxy's). IPs stay in memory for a minute and are never logged. */
const hits = new Map<string, { windowStart: number; n: number }>();
function rateLimited(ip: string | undefined, limit: number, now: number): number | null {
  if (!ip || limit <= 0) return null;
  const h = hits.get(ip);
  if (!h || now - h.windowStart >= 60_000) {
    hits.set(ip, { windowStart: now, n: 1 });
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.windowStart >= 60_000) hits.delete(k);
    return null;
  }
  h.n++;
  return h.n > limit ? Math.ceil((h.windowStart + 60_000 - now) / 1000) : null;
}

/* ------------------------------------------------------------------ handler */

export interface Req {
  method: string;
  url: string;
  ip?: string;
  /** request.cf.country: only ever used as an aggregate counter key. */
  country?: string;
  /** The Authorization header (only read by /v1/stats). */
  authorization?: string;
}

export interface HandleOpts {
  now?: number;
  rateLimitPerMin?: number;
}

export async function handle(req: Req, env: Env, opts: HandleOpts = {}): Promise<Res> {
  const now = opts.now ?? Date.now();
  let u: URL;
  try {
    u = new URL(req.url, "http://worker.local");
  } catch {
    return err(400, "Bad URL");
  }
  if (req.method === "OPTIONS") return { status: 204, headers: { ...CORS }, body: "" };
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const isHit = path === "/v1/hit";
  if (req.method !== "GET" && req.method !== "HEAD" && !(isHit && req.method === "POST"))
    return err(405, "Method not allowed", ALL_ATTRIBUTION, {}, { allow: isHit ? "GET, POST, OPTIONS" : "GET, OPTIONS" });
  const db = env.DB;

  if (path === "/health") return health(db, now);

  const retry = rateLimited(req.ip, opts.rateLimitPerMin ?? 60, now);
  if (retry !== null) return err(429, "Too many requests", ALL_ATTRIBUTION, {}, { "retry-after": String(retry) });

  const country = countryCode(req.country);
  const label = endpointLabel(path);
  if (label) countRequest(label, country, now);

  if (isHit) {
    // Fire-and-forget beacon from the site, web app and native apps. Only allow-listed events and values (metrics.ts).
    const r = countHit(u.searchParams, country, now);
    if (!r.ok) return err(400, r.error, []);
    return { status: 204, headers: { ...CORS, "access-control-allow-methods": "GET, POST, OPTIONS", "cache-control": "no-store" }, body: "" };
  }
  if (path === "/dash") return dashPage();
  if (path === "/v1/stats") {
    const token = (req.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!env.STATS_TOKEN) return err(404, "Not found");
    if (!sameSecret(token, env.STATS_TOKEN)) return err(401, "Unauthorized", [], {}, { "www-authenticate": "Bearer" });
    const days = Math.min(400, Math.max(1, Math.floor(Number(u.searchParams.get("days") ?? 30)) || 30));
    if (u.searchParams.get("refresh") === "github") await githubSnapshot(env, now);
    await flushUsage(db); // this isolate's buffered counts first
    return json(200, await readAllStats(env, days, now), "no-store");
  }

  if (path === "/") {
    return json(200, {
      service: "hazenow-data",
      runtime: "Cloudflare Worker (free plan): cron-polled upstreams, stored in D1",
      endpoints: ["/health", "/v1/countries", "/v1/scales", "/v1/{cc}/observations", "/v1/{cc|auto}/snapshot?lat=&lon=", "/v1/sg/nea/{pm25|psi}", "/v1/sensors/{id}/uptime", "/v1/hit?e=&…"],
      countries: SERVED.map((c) => c.toLowerCase()),
      source: "https://github.com/yongquantan/hazenow",
      attribution: ALL_ATTRIBUTION,
    });
  }
  if (path === "/v1/countries") {
    return json(200, { countries: Object.values(COUNTRIES).map((c) => ({ ...c, served: SERVED.includes(c.code) })), attribution: ALL_ATTRIBUTION }, "public, max-age=3600");
  }
  if (path === "/v1/scales") return json(200, { scales: SCALES, attribution: ALL_ATTRIBUTION }, "public, max-age=3600");

  let m = /^\/v1\/sg\/nea\/(pm25|psi)$/.exec(path);
  if (m) {
    const date = u.searchParams.get("date");
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err(400, "date must be YYYY-MM-DD", ATTRIBUTION.SG);
    if (date !== null && date !== sgtDate(now)) return err(404, "Only the latest NEA reading is mirrored; read data.gov.sg directly for other dates", ATTRIBUTION.SG);
    const row = await cachedRow(db, K.nea(m[1]), now);
    if (!row) return err(502, "sg.nea.v2: not mirrored yet", ATTRIBUTION.SG);
    const data = parseOr<Record<string, unknown>>(row, {});
    return json(200, { ...data, attribution: ATTRIBUTION.SG, fetchedAt: new Date(row.at).toISOString() }, "public, max-age=60");
  }

  m = /^\/v1\/sensors\/([^/]+)\/uptime$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const crowdAttr = ATTRIBUTION.PH;
    if (!SENSOR_ID.test(id)) return err(400, "Sensor ids look like ag:12345 (AirGradient) or sc:94332 (Sensor.Community)", crowdAttr);
    const cs = parseOr<Pick<CrowdState, "since"> | null>(await cachedRow(db, K.crowdState, now), null);
    const out = await sensorUptime(db, id, now, cs?.since ?? null);
    if (!out) return err(404, `No hourly log for ${id} yet`, crowdAttr);
    const attribution = crowdAttr.filter((a) => (id.startsWith("sc:") ? a.id === "crowd.sensorcommunity" : a.id === "crowd.airgradient"));
    return json(200, { ...out, attribution }, "public, max-age=900");
  }

  m = /^\/v1\/([a-z]{2}|auto)\/(observations|snapshot)$/.exec(path);
  if (m) {
    const [, ccRaw, kind] = m;
    let cc = ccRaw.toUpperCase() as CountryCode;
    if (kind === "observations") {
      if (ccRaw === "auto") return err(400, "observations needs a country code");
      if (!(cc in COUNTRIES)) return err(404, `Unknown country ${ccRaw}`);
      if (!SERVED.includes(cc)) return err(404, `${COUNTRIES[cc].name} is not covered yet: ${COUNTRIES[cc].nowNumber}`, [], { status: COUNTRIES[cc].status });
      const grade = u.searchParams.get("grade");
      if (grade !== null && grade !== "lowcost") return err(400, "grade must be lowcost");
      // TH's lowcost set is precomposed (the direct Thai adapter polls it); other countries filter on the fly.
      const row = await setRow(db, grade && cc === "TH" ? K.setLowcost(cc) : K.set(cc), cc, now);
      if (!grade || cc === "TH" || !row || row.status !== 200) return served(row, cc);
      return raw(200, JSON.stringify(lowcostOnly(JSON.parse(row.v) as ObservationSet)), "public, max-age=30, stale-while-revalidate=300");
    }
    // snapshot
    const lat = Number(u.searchParams.get("lat"));
    const lon = Number(u.searchParams.get("lon"));
    if (!u.searchParams.has("lat") || !u.searchParams.has("lon") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      return err(400, "lat and lon are required numbers");
    const clat = coarse(lat);
    const clon = coarse(lon);
    const located = countryAt(clat, clon);
    if (!located) return err(404, "That location is outside the countries HazeNow covers", ALL_ATTRIBUTION, { country: null });
    if (ccRaw === "auto") cc = located;
    else if (!(cc in COUNTRIES)) return err(404, `Unknown country ${ccRaw}`);
    else if (cc !== located) return err(409, `That location is in ${COUNTRIES[located].name}, not ${COUNTRIES[cc].name}`, ALL_ATTRIBUTION, { country: located });
    if (!SERVED.includes(cc)) return err(404, `${COUNTRIES[cc].name} is not covered yet: ${COUNTRIES[cc].nowNumber}`, [], { country: cc, status: COUNTRIES[cc].status });
    const profile = normaliseProfile((u.searchParams.get("profile") ?? "general").split(","));
    return snapshotFor(db, cc, clat, clon, profile, now);
  }
  return err(404, "Not found");
}

function served(row: KvRow | null, cc: CountryCode): Res {
  if (!row) return err(503, `No data available for ${cc} right now`, ATTRIBUTION[cc] ?? [], { warnings: ["the first cron run has not finished yet"] }, { "retry-after": "60" });
  if (row.status !== 200) return raw(row.status, row.v, "no-store", { "retry-after": "60" });
  return raw(200, row.v, "public, max-age=30, stale-while-revalidate=300");
}

async function snapshotFor(db: D1Database, cc: CountryCode, lat: number, lon: number, profile: Profile[], now: number): Promise<Res> {
  const row = await setRow(db, K.set(cc), cc, now);
  if (!row || row.status !== 200) return served(row, cc);
  const set = JSON.parse(row.v) as ObservationSet;
  let snapshot: CountrySnapshot;
  try {
    if (cc === "SG") {
      const rawRow = await cachedRow(db, K.sgRaw, now);
      const rawSg = parseOr<RawResponses | null>(rawRow, null);
      if (!rawSg) return served(null, cc);
      snapshot = fromSgSnapshot(buildSnapshot(rawSg, { lat, lon }, now));
    } else snapshot = buildCountrySnapshot(set, { lat, lon }, now);
  } catch (e) {
    if (e instanceof OfficialUnavailableError)
      return err(503, e.message, ATTRIBUTION[cc] ?? [], { officialUnavailable: e.source }, { "retry-after": "60" });
    return err(500, "Internal error", ATTRIBUTION[cc] ?? []);
  }
  return json(
    200,
    {
      snapshot,
      verdict: countryVerdict(snapshot, profile),
      officialLine: officialLine(snapshot),
      location: { lat, lon, rounded: "2dp" },
      generatedAt: new Date(now).toISOString(),
      ...(set.warnings?.length ? { warnings: set.warnings } : {}),
      attribution: snapshot.attribution,
    },
    "public, max-age=30",
  );
}

async function health(db: D1Database, now: number): Promise<Res> {
  let rows: KvRow[] = [];
  let dbError: string | null = null;
  try {
    rows = await kvPrefix(db, "job:");
  } catch (e) {
    dbError = (e as Error).message;
  }
  const jobs: Record<string, unknown> = {};
  const sources: Record<string, unknown> = {};
  let usedLastHour = 0;
  let usedToday = 0;
  const states = new Map(rows.map((r) => [r.k.slice(4), parseOr<JobState | null>(r, null)]));
  for (const [job, ids] of Object.entries(JOB_SOURCES)) {
    const st = states.get(job) ?? null;
    jobs[job] = {
      lastRunAt: st?.lastRunAt ? new Date(st.lastRunAt).toISOString() : null,
      ageSec: st?.lastRunAt ? Math.round((now - st.lastRunAt) / 1000) : null,
      runs: st?.runs ?? 0,
      lastRunError: st?.lastRunError ?? null,
      ...(job === "crowd"
        ? { sensorsLoggedLastHour: st?.sensorsLogged ?? null, lastLoggedHour: st?.lastClosedHour ? new Date(st.lastClosedHour).toISOString() : null, lastRetentionAt: st?.lastRetentionAt ? new Date(st.lastRetentionAt).toISOString() : null }
        : { officialAt: st?.officialAt ? new Date(st.officialAt).toISOString() : null }),
    };
    for (const id of ids) {
      const h = sourceHealth(id, st?.sources[id], now);
      sources[id] = h;
      usedLastHour += h.callsLastHour;
      usedToday += h.callsToday;
    }
  }
  return json(
    200,
    {
      ok: !dbError,
      service: "hazenow-data",
      version: VERSION,
      time: new Date(now).toISOString(),
      runtime: "cloudflare-worker",
      store: { kind: "d1", lastError: dbError },
      schedule: { cron: "* * * * *", jobByMinuteMod5: SCHEDULE.map((j) => j.join("+")) },
      budget: { ...budget(), usedLastHour, usedToday },
      jobs,
      sources,
      attribution: ALL_ATTRIBUTION,
    },
    "no-store",
  );
}

/** Sources polled by the Worker (the proxy's list minus the world-dump fallback, too CPU-heavy for 10 ms). */
export const WORKER_SOURCES = Object.values(JOB_SOURCES).flat();
export { SOURCES };
