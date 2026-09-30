/**
 * Budgeted, allow-listed upstream access.
 *
 *  - Allow-list: a source may only call its own hosts over https. Anything else throws before any I/O.
 *  - Freshness: a cached payload younger than the source's TTL is returned without calling upstream.
 *  - Single flight: concurrent requests for the same URL share one upstream call.
 *  - Budget: at most `budgetPerHour` calls per source in any rolling hour, and exponential backoff
 *    (30 s → 10 min, honouring Retry-After) after failures. When the budget or backoff blocks a call, the last good
 *    payload is served with its real age (stale-if-error); with nothing cached, the call fails.
 *  So the upstream load is fixed by the schedule, never by the number of users.
 */
import type { Cache, CacheEntry } from "./cache.js";
import { SOURCES, type SourceDef } from "./sources.js";
import { parseLenientJson } from "../../../packages/core/src/countries/index.js";

export type FetchImpl = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; headers?: { get(n: string): string | null }; text(): Promise<string> }>;

export class UpstreamError extends Error {
  constructor(
    message: string,
    public sourceId: string,
    public status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface Got<T> extends CacheEntry<T> {
  /** True when served past its TTL because upstream failed or the budget/backoff blocked a call. */
  stale: boolean;
  error: string | null;
}

interface SourceState {
  calls: number[];
  failures: number;
  blockedUntil: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastStatus: number | null;
}

export const USER_AGENT = "HazeNow-proxy/0.1 (+https://github.com/yongquantan/hazenow; free, open-source haze app)";

export function backoffMs(failures: number, retryAfterSec?: number): number {
  const base = Math.min(10 * 60_000, 30_000 * 2 ** Math.max(0, failures - 1));
  return retryAfterSec && retryAfterSec > 0 ? Math.max(base, Math.min(retryAfterSec * 1000, 60 * 60_000)) : base;
}

export class Upstreams {
  private state = new Map<string, SourceState>();
  private inflight = new Map<string, Promise<Got<unknown>>>();

  constructor(
    private cache: Cache,
    private fetchImpl: FetchImpl,
    private clock: () => number = Date.now,
    private sources: Record<string, SourceDef> = SOURCES,
    private extraHeaders: (src: SourceDef, url: string) => Record<string, string> = () => ({}),
  ) {}

  private st(id: string): SourceState {
    let s = this.state.get(id);
    if (!s) {
      s = { calls: [], failures: 0, blockedUntil: 0, lastOkAt: null, lastErrorAt: null, lastError: null, lastStatus: null };
      this.state.set(id, s);
    }
    return s;
  }

  /** Throws before any network I/O if the URL is not on the source's allow-list. */
  assertAllowed(src: SourceDef, url: string): void {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new UpstreamError(`Not a URL: ${url}`, src.id);
    }
    if (u.protocol !== "https:" || !src.hosts.includes(u.hostname) || u.username || u.password) {
      throw new UpstreamError(`Blocked: ${u.hostname} is not allow-listed for ${src.id}`, src.id);
    }
  }

  callsLastHour(id: string): number {
    const now = this.clock();
    const s = this.st(id);
    s.calls = s.calls.filter((t) => now - t < 3600_000);
    return s.calls.length;
  }

  async get<T = unknown>(sourceId: string, url: string): Promise<Got<T>> {
    const src = this.sources[sourceId];
    if (!src) throw new UpstreamError(`Unknown source ${sourceId}`, sourceId);
    this.assertAllowed(src, url);
    const now = this.clock();
    const key = `${sourceId}|${url}`;
    const cached = await this.cache.get<T>(key);
    if (cached && now - cached.fetchedAt < src.ttlMs(now)) return { ...cached, stale: false, error: null };
    const running = this.inflight.get(key);
    if (running) return running as Promise<Got<T>>;
    const p = this.fetchNow<T>(src, url, key, cached).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p as Promise<Got<unknown>>);
    return p;
  }

  private async fetchNow<T>(src: SourceDef, url: string, key: string, cached: CacheEntry<T> | null): Promise<Got<T>> {
    const s = this.st(src.id);
    const now = this.clock();
    const serveStale = (why: string): Got<T> => {
      if (cached) return { ...cached, stale: true, error: why };
      throw new UpstreamError(`${src.id}: ${why}; nothing cached`, src.id, s.lastStatus ?? undefined);
    };
    if (now < s.blockedUntil) return serveStale(`backing off after errors until ${new Date(s.blockedUntil).toISOString()}`);
    if (this.callsLastHour(src.id) >= src.budgetPerHour) return serveStale(`hourly budget of ${src.budgetPerHour} calls used`);

    s.calls.push(now);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error("timeout")), src.timeoutMs ?? 8_000);
    try {
      const res = await this.fetchImpl(url, {
        signal: ac.signal,
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...src.headers, ...this.extraHeaders(src, url) },
      });
      s.lastStatus = res.status;
      if (!res.ok) {
        const ra = Number(res.headers?.get("retry-after"));
        throw Object.assign(new Error(`HTTP ${res.status}`), { retryAfter: Number.isFinite(ra) ? ra : undefined });
      }
      const text = await res.text();
      let data: unknown;
      if (src.body === "text") data = text;
      else if (src.body === "lenient-json") {
        data = parseLenientJson(text);
        if (data === null) throw new Error("unparseable JSON");
      } else {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("unparseable JSON");
        }
      }
      if (src.reduce) data = src.reduce(data);
      const entry: CacheEntry<T> = { data: data as T, fetchedAt: this.clock() };
      await this.cache.set(key, entry, src.keepMs);
      s.failures = 0;
      s.blockedUntil = 0;
      s.lastOkAt = entry.fetchedAt;
      return { ...entry, stale: false, error: null };
    } catch (e) {
      const err = e as Error & { retryAfter?: number };
      const msg = ac.signal.aborted ? "timeout" : err.message;
      s.failures++;
      s.blockedUntil = this.clock() + backoffMs(s.failures, err.retryAfter);
      s.lastErrorAt = this.clock();
      s.lastError = msg;
      return serveStale(msg);
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Record<string, unknown> {
    const now = this.clock();
    const out: Record<string, unknown> = {};
    for (const src of Object.values(this.sources)) {
      const s = this.st(src.id);
      out[src.id] = {
        ok: s.lastError === null || (s.lastOkAt !== null && (s.lastErrorAt ?? 0) < s.lastOkAt),
        lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : null,
        ageSec: s.lastOkAt ? Math.round((now - s.lastOkAt) / 1000) : null,
        lastError: s.lastError,
        lastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : null,
        lastStatus: s.lastStatus,
        callsLastHour: this.callsLastHour(src.id),
        budgetPerHour: src.budgetPerHour,
        ttlSec: Math.round(src.ttlMs(now) / 1000),
        backingOffUntil: s.blockedUntil > now ? new Date(s.blockedUntil).toISOString() : null,
        cadence: src.cadence,
      };
    }
    return out;
  }
}
