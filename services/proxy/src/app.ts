/**
 * HTTP routes (framework-free, testable without sockets).
 *
 *   GET /health                          per-source status, budget use, cache kind
 *   GET /v1/countries                    coverage registry
 *   GET /v1/scales                       band-scale registry (hot-fixable copy of core's)
 *   GET /v1/{cc}/observations            normalised ObservationSet — preferred: no location sent
 *   GET /v1/{cc|auto}/snapshot?lat&lon   built snapshot for dumb clients; coordinates rounded to 2 dp, never logged
 *   GET /v1/sg/nea/{pm25|psi}[?date=]    NEA v2 passthrough with the optional server-side NEA_API_KEY
 *
 * Every response: CORS *, JSON, and an `attribution` array clients must render.
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
} from "../../../packages/core/src/countries/index.js";
import { buildSnapshot } from "../../../packages/core/src/snapshot.js";
import { normaliseProfile, type Profile } from "../../../packages/core/src/experience.js";
import type { Cache } from "./cache.js";
import { ALL_ATTRIBUTION, ATTRIBUTION, CountryService, NoDataForCountry, SERVED } from "./countries.js";
import { TOTAL_BUDGET_PER_HOUR, URLS } from "./sources.js";
import { UpstreamError, type Upstreams } from "./upstream.js";
import type { ObservationSet } from "../../../packages/core/src/countries/index.js";

/** The set's community sensors only, with their attribution (for the direct Thai adapter). */
export function lowcostOnly(set: ObservationSet): ObservationSet {
  const observations = set.observations.filter((o) => o.grade === "lowcost");
  const ids = new Set(observations.map((o) => o.attributionId));
  return { ...set, observations, attribution: set.attribution.filter((a) => ids.has(a.id)), hotspots: undefined, hotspotSource: undefined };
}

export interface Req {
  method: string;
  /** path + query, e.g. "/v1/th/snapshot?lat=13.75&lon=100.5" */
  url: string;
  ip?: string;
}

export interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface AppDeps {
  upstreams: Upstreams;
  service: CountryService;
  cache: Cache;
  clock?: () => number;
  rateLimitPerMin?: number;
  startedAt?: number;
  version?: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "access-control-max-age": "86400",
};

function json(status: number, body: unknown, cache = "public, max-age=30, stale-while-revalidate=300", extra: Record<string, string> = {}): Res {
  return {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": cache, "x-content-type-options": "nosniff", ...extra },
    body: JSON.stringify(body),
  };
}

const err = (status: number, message: string, attribution = ALL_ATTRIBUTION, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  json(status, { error: message, ...extra, attribution }, "no-store", headers);

/** Round to 2 dp (~1 km): the proxy never sees a precise location (SPEC v1.4 §5). */
export const coarse = (x: number) => Math.round(x * 100) / 100;

export function createApp(deps: AppDeps) {
  const clock = deps.clock ?? Date.now;
  const limit = deps.rateLimitPerMin ?? 60;
  const startedAt = deps.startedAt ?? clock();
  const hits = new Map<string, { windowStart: number; n: number }>();
  const serialised = new WeakMap<object, string>();
  const serialisedLowcost = new WeakMap<object, string>();

  function rateLimited(ip: string | undefined): number | null {
    if (!ip || limit <= 0) return null;
    const now = clock();
    const h = hits.get(ip);
    if (!h || now - h.windowStart >= 60_000) {
      hits.set(ip, { windowStart: now, n: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.windowStart >= 60_000) hits.delete(k);
      return null;
    }
    h.n++;
    return h.n > limit ? Math.ceil((h.windowStart + 60_000 - now) / 1000) : null;
  }

  async function snapshotFor(cc: CountryCode, lat: number, lon: number, profile: Profile[]) {
    const now = clock();
    let snapshot: CountrySnapshot;
    let warnings: string[] | undefined;
    if (cc === "SG") {
      const w: string[] = [];
      const raw = await deps.service.sgRaw(w);
      snapshot = fromSgSnapshot(buildSnapshot(raw, { lat, lon }, now));
      warnings = w.length ? w : undefined;
    } else {
      const set = await deps.service.observations(cc);
      snapshot = buildCountrySnapshot(set, { lat, lon }, now);
      warnings = set.warnings;
    }
    const v = countryVerdict(snapshot, profile);
    return {
      snapshot,
      verdict: v,
      officialLine: officialLine(snapshot),
      location: { lat, lon, rounded: "2dp" },
      generatedAt: new Date(now).toISOString(),
      ...(warnings ? { warnings } : {}),
      attribution: snapshot.attribution,
    };
  }

  return async function handle(req: Req): Promise<Res> {
    let u: URL;
    try {
      u = new URL(req.url, "http://proxy.local");
    } catch {
      return err(400, "Bad URL");
    }
    if (req.method === "OPTIONS") return { status: 204, headers: { ...CORS }, body: "" };
    if (req.method !== "GET" && req.method !== "HEAD") return err(405, "Method not allowed", ALL_ATTRIBUTION, {}, { allow: "GET, OPTIONS" });
    const path = u.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health") {
      const sources = deps.upstreams.health() as Record<string, { callsLastHour: number }>;
      const used = Object.values(sources).reduce((s, x) => s + x.callsLastHour, 0);
      return json(200, {
        ok: true,
        service: "hazenow-proxy",
        version: deps.version ?? "0.1.0",
        time: new Date(clock()).toISOString(),
        uptimeSec: Math.round((clock() - startedAt) / 1000),
        cache: { kind: deps.cache.kind, lastError: deps.cache.lastError ?? null },
        budget: { maxUpstreamCallsPerHour: TOTAL_BUDGET_PER_HOUR, usedLastHour: used },
        rings: deps.service.rings.sizes(),
        sources,
        attribution: ALL_ATTRIBUTION,
      }, "no-store");
    }

    const retry = rateLimited(req.ip);
    if (retry !== null) return err(429, "Too many requests", ALL_ATTRIBUTION, {}, { "retry-after": String(retry) });

    if (path === "/") {
      return json(200, {
        service: "hazenow-proxy",
        endpoints: ["/health", "/v1/countries", "/v1/scales", "/v1/{cc}/observations", "/v1/{cc|auto}/snapshot?lat=&lon=", "/v1/sg/nea/{pm25|psi}?date="],
        countries: SERVED.map((c) => c.toLowerCase()),
        source: "https://github.com/yongquantan/hazenow",
        attribution: ALL_ATTRIBUTION,
      });
    }
    if (path === "/v1/countries") {
      return json(200, {
        countries: Object.values(COUNTRIES).map((c) => ({ ...c, served: SERVED.includes(c.code) })),
        attribution: ALL_ATTRIBUTION,
      }, "public, max-age=3600");
    }
    if (path === "/v1/scales") return json(200, { scales: SCALES, attribution: ALL_ATTRIBUTION }, "public, max-age=3600");

    let m = /^\/v1\/sg\/nea\/(pm25|psi)$/.exec(path);
    if (m) {
      const date = u.searchParams.get("date");
      if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err(400, "date must be YYYY-MM-DD", ATTRIBUTION.SG);
      try {
        const g = await deps.upstreams.get<Record<string, unknown>>("sg.nea.v2", URLS.neaV2(m[1] as "pm25" | "psi", date ?? undefined));
        const body = g.data && typeof g.data === "object" ? { ...g.data } : { data: g.data };
        return json(200, { ...body, attribution: ATTRIBUTION.SG, fetchedAt: new Date(g.fetchedAt).toISOString(), ...(g.stale ? { warning: g.error } : {}) }, "public, max-age=60");
      } catch (e) {
        return err(502, (e as Error).message, ATTRIBUTION.SG);
      }
    }

    m = /^\/v1\/([a-z]{2}|auto)\/(observations|snapshot)$/.exec(path);
    if (m) {
      const [, ccRaw, kind] = m;
      let cc = ccRaw.toUpperCase() as CountryCode;
      if (kind === "observations") {
        if (ccRaw === "auto") return err(400, "observations needs a country code");
        if (!(cc in COUNTRIES)) return err(404, `Unknown country ${ccRaw}`);
        if (!SERVED.includes(cc))
          return err(404, `${COUNTRIES[cc].name} is not covered yet: ${COUNTRIES[cc].nowNumber}`, [], { status: COUNTRIES[cc].status });
        // ?grade=lowcost: community sensors only (the direct Thai adapter reads Air4Thai itself and only needs these).
        const grade = u.searchParams.get("grade");
        if (grade !== null && grade !== "lowcost") return err(400, "grade must be lowcost");
        try {
          const set = await deps.service.observations(cc);
          const cache = grade ? serialisedLowcost : serialised;
          let body = cache.get(set);
          if (!body) {
            const out = grade ? lowcostOnly(set) : set;
            cache.set(set, (body = JSON.stringify({ ...out, generatedAt: new Date(clock()).toISOString() })));
          }
          return { ...json(200, null), body };
        } catch (e) {
          return failure(e, cc);
        }
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
      else if (cc !== located)
        // The jurisdiction follows the location (REGIONAL §3.5): never answer SG for a Johor point.
        return err(409, `That location is in ${COUNTRIES[located].name}, not ${COUNTRIES[cc].name}`, ALL_ATTRIBUTION, { country: located });
      if (!SERVED.includes(cc))
        return err(404, `${COUNTRIES[cc].name} is not covered yet: ${COUNTRIES[cc].nowNumber}`, [], { country: cc, status: COUNTRIES[cc].status });
      const profile = normaliseProfile((u.searchParams.get("profile") ?? "general").split(","));
      try {
        return json(200, await snapshotFor(cc, clat, clon, profile), "public, max-age=30");
      } catch (e) {
        return failure(e, cc);
      }
    }
    return err(404, "Not found");
  };

  function failure(e: unknown, cc: CountryCode): Res {
    if (e instanceof NoDataForCountry) return err(503, e.message, ATTRIBUTION[cc] ?? [], { warnings: e.warnings }, { "retry-after": "60" });
    if (e instanceof UpstreamError) return err(502, e.message, ATTRIBUTION[cc] ?? []);
    if (e instanceof OfficialUnavailableError) return err(503, e.message, ATTRIBUTION[cc] ?? [], { officialUnavailable: e.source }, { "retry-after": "60" });
    return err(500, "Internal error", ATTRIBUTION[cc] ?? []);
  }
}
