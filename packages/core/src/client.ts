/**
 * I/O layer (SPEC v1.3): two NEA sources, merged per hour and region by the pure builder.
 *
 *  - v1 `api.data.gov.sg/v1/environment/{pm25,psi}` : first-publish stamps (~1 min after the hour), no observed
 *    rate limit. Primary for freshness. Polled every minute from hh:00:30 until the new hour appears.
 *  - v2 `api-open.data.gov.sg/v2/real-time/api/{pm25,psi}` : back-fills gaps, but rate-limited (HTTP 429 with
 *    `{"code":24}` after ~4 rapid calls). Called only at ~hh:35 / ~hh:50 (or as a fallback when v1 fails),
 *    with exponential backoff 30 s → 10 min on 429/network errors, honouring Retry-After.
 *
 * Yesterday's v1 responses and the latest v2 responses are cached in memory between polls.
 */
import { API_BASE, API_V1_BASE } from "./constants.js";
import { backoffMs, sgtDate, shouldFetchV2 } from "./format.js";
import { fromV1, type ApiResponse } from "./parse.js";
import { buildSnapshot, NoDataError } from "./snapshot.js";
import type { LocationQuery, Snapshot } from "./types.js";

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export interface GetSnapshotOptions extends LocationQuery {
  /** Custom fetch (tests, Workers, proxies). Defaults to globalThis.fetch. */
  fetch?: FetchLike;
  /** Clock override for tests. */
  now?: Date | number;
  signal?: AbortSignal;
  /** Fetch yesterday too, for ≥12 h of history + the 24-hr line (default true). */
  history?: boolean;
  /** v2 base URL override (e.g. a caching proxy). */
  baseUrl?: string;
  /** v1 base URL override. */
  v1BaseUrl?: string;
  /** When to call the rate-limited v2 API: "auto" (at ~:35/:50, or as fallback), "always", or "never". */
  v2?: "auto" | "always" | "never";
  /** Delay before the single retry of a v1 network/5xx error (default 1000 ms; tests use 0). */
  retryDelayMs?: number;
}

export interface RawResponses {
  v1Pm25: (ApiResponse | null)[];
  v1Psi: (ApiResponse | null)[];
  pm25Latest: ApiResponse | null;
  pm25Days: (ApiResponse | null)[];
  psi: ApiResponse | null;
  psiDays: (ApiResponse | null)[];
}

export class FetchError extends Error {
  status?: number;
  retryAfterSec?: number;
  constructor(message: string, status?: number, retryAfterSec?: number) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/* ------------------------------------------------------------------ in-memory state between polls */

const YESTERDAY_TTL_MS = 60 * 60_000;
const cache = new Map<string, { at: number; data: ApiResponse }>();
const v2State = {
  lastAt: null as number | null,
  failures: 0,
  blockedUntil: 0,
  pm25: null as { date: string; data: ApiResponse } | null,
  psi: null as { date: string; data: ApiResponse } | null,
};

/** Drop all in-memory caches and v2 backoff state. */
export function clearCache(): void {
  cache.clear();
  v2State.lastAt = null;
  v2State.failures = 0;
  v2State.blockedUntil = 0;
  v2State.pm25 = null;
  v2State.psi = null;
}

/** For UIs/diagnostics: when v2 may be called again (epoch ms), 0 if not backing off. */
export function v2BackoffUntil(): number {
  return v2State.blockedUntil;
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("Aborted"));
    });
  });

async function getOnce(f: FetchLike, url: string, signal?: AbortSignal): Promise<ApiResponse> {
  const res = await f(url, { signal, headers: { accept: "application/json" } });
  if (!res.ok) {
    const ra = Number(res.headers?.get("retry-after"));
    throw new FetchError(`HTTP ${res.status} for ${url}`, res.status, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  const body = fromV1(await res.json());
  if (!body) throw new FetchError(`Unexpected response for ${url}`);
  return body;
}

/** v1: one quick retry on network errors / 5xx. */
async function getV1(f: FetchLike, url: string, opts: GetSnapshotOptions): Promise<ApiResponse> {
  try {
    return await getOnce(f, url, opts.signal);
  } catch (e) {
    const status = (e as FetchError).status;
    const retryable = status === undefined ? !(e instanceof FetchError) : status >= 500 || status === 429;
    if (!retryable || opts.signal?.aborted) throw e;
    await wait(opts.retryDelayMs ?? 1000, opts.signal);
    return await getOnce(f, url, opts.signal);
  }
}

async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

const hasItems = (r: ApiResponse | null | undefined) => !!r && (r.data?.items?.length ?? 0) > 0;

/** Fetch all raw responses. Individual failures become null. Throws only if no PM2.5 data at all. */
export async function fetchRaw(opts: GetSnapshotOptions = {}): Promise<RawResponses> {
  const f: FetchLike | undefined =
    opts.fetch ?? (globalThis.fetch ? (globalThis.fetch.bind(globalThis) as unknown as FetchLike) : undefined);
  if (!f) throw new FetchError("No fetch implementation available (Node 18+ required)");
  const v2Base = (opts.baseUrl ?? API_BASE).replace(/\/$/, "");
  const v1Base = (opts.v1BaseUrl ?? API_V1_BASE).replace(/\/$/, "");
  const nowRaw = opts.now ?? Date.now();
  const now = typeof nowRaw === "number" ? nowRaw : nowRaw.getTime();
  const today = sgtDate(now);
  const yesterday = sgtDate(now - 24 * 3600_000);
  const wantHistory = opts.history !== false;

  const v1 = (path: string) => getV1(f, `${v1Base}/${path}`, opts);
  const v1Cached = async (path: string) => {
    const key = `${v1Base}/${path}`;
    const hit = cache.get(key);
    if (hit && Math.abs(now - hit.at) < YESTERDAY_TTL_MS) return hit.data;
    const data = await v1(path);
    cache.set(key, { at: now, data });
    return data;
  };

  // 1. v1 (primary): today's hours (includes the latest), plus yesterday for history.
  const [p1, s1, p1y, s1y] = await Promise.all([
    settle(v1(wantHistory ? `pm25?date=${today}` : "pm25")),
    settle(v1(wantHistory ? `psi?date=${today}` : "psi")),
    wantHistory ? settle(v1Cached(`pm25?date=${yesterday}`)) : Promise.resolve(null),
    wantHistory ? settle(v1Cached(`psi?date=${yesterday}`)) : Promise.resolve(null),
  ]);
  // Just after midnight "today" can be empty: fall back to the latest endpoints.
  const [p1l, s1l] = await Promise.all([
    wantHistory && !hasItems(p1) ? settle(v1("pm25")) : Promise.resolve(null),
    wantHistory && !hasItems(s1) ? settle(v1("psi")) : Promise.resolve(null),
  ]);
  const v1Pm25 = [p1, p1y, p1l];
  const v1Psi = [s1, s1y, s1l];
  const v1Failed = !v1Pm25.some(hasItems);

  // 2. v2 (back-fill / fallback), rate-limit aware.
  const mode = opts.v2 ?? "auto";
  const due = mode === "always" || (mode === "auto" && (v1Failed || shouldFetchV2(now, v2State.lastAt)));
  if (mode !== "never" && due && now >= v2State.blockedUntil) {
    v2State.lastAt = now;
    const path = (k: string) => `${v2Base}/${k}${wantHistory ? `?date=${today}` : ""}`;
    const results = await Promise.allSettled([getOnce(f, path("pm25"), opts.signal), getOnce(f, path("psi"), opts.signal)]);
    const [rp, rs] = results;
    if (rp.status === "fulfilled") v2State.pm25 = { date: today, data: rp.value };
    if (rs.status === "fulfilled") v2State.psi = { date: today, data: rs.value };
    const err = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (err) {
      const e = err.reason as FetchError;
      v2State.failures++;
      v2State.blockedUntil = now + backoffMs(v2State.failures - 1, e?.retryAfterSec);
    } else {
      v2State.failures = 0;
      v2State.blockedUntil = 0;
    }
  }
  const pm25V2 = v2State.pm25?.date === today ? v2State.pm25.data : null;
  const psiV2 = v2State.psi?.date === today ? v2State.psi.data : null;

  if (v1Failed && !hasItems(pm25V2)) {
    const blocked = now < v2State.blockedUntil;
    throw new FetchError(`Could not reach data.gov.sg (no PM2.5 data${blocked ? "; v2 rate-limited" : ""})`);
  }
  return {
    v1Pm25,
    v1Psi,
    pm25Latest: null,
    pm25Days: [pm25V2],
    psi: null,
    psiDays: [psiV2],
  };
}

/** Fetch live data and compute the Snapshot for a location / region. */
export async function getSnapshot(opts: GetSnapshotOptions = {}): Promise<Snapshot> {
  const raw = await fetchRaw(opts);
  return buildSnapshot(raw, { lat: opts.lat, lon: opts.lon, region: opts.region }, opts.now ?? Date.now());
}

export { NoDataError };
