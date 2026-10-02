/**
 * Budgeted, allow-listed upstream polling for the cron jobs. The allow-list, TTLs, hourly budgets and cadences are
 * services/proxy's (src/sources.ts), unchanged: the only difference is WHO calls. On the proxy a request could
 * trigger a refresh; here only the cron jobs call upstream, so the upstream load is fixed by the schedule.
 *
 *  - Allow-list: a source may only call its own hosts over https (checked before any I/O).
 *  - Due: a source is polled when its last good payload is older than its TTL (minus a little slack for cron jitter).
 *  - Budget: never more than `budgetPerHour` calls in any rolling hour; exponential backoff after failures
 *    (30 s → 10 min, honouring Retry-After), exactly as the proxy.
 * State lives in the job's row in D1 (see jobs.ts), so it survives isolate restarts.
 */
import { SOURCES, type SourceDef } from "../../proxy/src/sources.js";
import { parseLenientJson } from "../../../packages/core/src/countries/index.js";

export { SOURCES, URLS } from "../../proxy/src/sources.js";

/** The proxy's backoff (services/proxy/src/upstream.ts): 30 s → 10 min, honouring Retry-After up to 1 h. */
export function backoffMs(failures: number, retryAfterSec?: number): number {
  const base = Math.min(10 * 60_000, 30_000 * 2 ** Math.max(0, failures - 1));
  return retryAfterSec && retryAfterSec > 0 ? Math.max(base, Math.min(retryAfterSec * 1000, 60 * 60_000)) : base;
}

export const USER_AGENT = "HazeNow-data/0.2 (Cloudflare Worker; +https://github.com/yongquantan/hazenow; free, open-source haze app)";
/** Cron runs land a few seconds either side of the minute: a 5-min TTL must not turn into a 10-min one. */
export const DUE_SLACK_MS = 45_000;
const HOUR = 3600_000;

/**
 * Worker-only TTL overrides. NEA v2 is mirrored only for /v1/sg/nea (clients read NEA directly), so it is polled
 * every 15 min instead of every minute: "mirror NEA as a fallback only if cheap".
 */
export const TTL_OVERRIDE: Record<string, (now: number) => number> = {
  "sg.nea.v2": () => 15 * 60_000,
  // Clients read Air4Thai directly; the Worker needs it only as the anchor for Thai community sensors, the hourly
  // station log and dumb clients' /v1/th/snapshot. Twice an hour is enough, and its parse is the costliest job.
  "th.air4thai.aqi": () => 30 * 60_000,
};

/** Worker-only timeouts: Hanoi answers slowly outside Asia (cron runs can land anywhere); 10 s timed out. */
export const TIMEOUT_OVERRIDE: Record<string, number> = { "vn.hanoi.aqi": 30_000, "vn.hanoi.site": 30_000 };

/**
 * Hanoi's dailystat, streamed: "PM2.5" is the first key, so we decode only until its array closes (~1/6 of the
 * 2.3 MB), keep a rolling tail of text, then cancel the download. Same result as hanoiPm25Tail(await res.text()).
 */
export async function hanoiPm25TailStream(body: ReadableStream<Uint8Array> | null, keep = 600): Promise<{ "PM2.5": unknown[] }> {
  if (!body) return { "PM2.5": [] };
  const reader = body.getReader();
  const dec = new TextDecoder();
  let head = ""; // text until the "PM2.5" key is found
  let tail = ""; // rolling window of the array's text
  let inArray = false;
  const KEY = '"PM2.5":[';
  const WINDOW = keep * 60; // ~40 bytes per sample; generous
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const chunk = done ? dec.decode() : dec.decode(value, { stream: true });
      if (!inArray) {
        head += chunk;
        const k = head.indexOf(KEY);
        if (k >= 0) {
          inArray = true;
          tail = head.slice(k);
          head = "";
        } else if (done) return { "PM2.5": [] };
        else head = head.slice(-KEY.length);
      } else tail += chunk;
      if (inArray) {
        const end = tail.indexOf("]");
        if (end >= 0) return hanoiPm25Tail(`{${tail.slice(0, end + 1)}}`, keep);
        if (tail.length > 2 * WINDOW) tail = KEY + tail.slice(tail.indexOf("{", tail.length - WINDOW));
        if (done) throw new Error("truncated dailystat");
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

export interface SrcState {
  /** Upstream call times in the last hour (ms). */
  calls: number[];
  failures: number;
  blockedUntil: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastStatus: number | null;
  /** Last good payload per sub-key (station id, "pm25"/"psi", or ""), for the TTL check. */
  okAt: Record<string, number>;
  /** Calls made today (UTC), for /health's budget math. */
  day: string;
  callsToday: number;
}

export const newSrcState = (): SrcState => ({
  calls: [],
  failures: 0,
  blockedUntil: 0,
  lastOkAt: null,
  lastErrorAt: null,
  lastError: null,
  lastStatus: null,
  okAt: {},
  day: "",
  callsToday: 0,
});

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export class SkipError extends Error {}

export interface PollOk<T> {
  data: T;
  fetchedAt: number;
}

export const ttlOf = (src: SourceDef, now: number) => (TTL_OVERRIDE[src.id] ?? src.ttlMs)(now);

/**
 * Hanoi's dailystat is 30 days × 6 pollutants of 5-min data (~2.3 MB). Parsing all of it would cost more CPU than a
 * free Worker gets, so we cut the "PM2.5" array's last 600 samples (50 h, what the proxy's reduce() keeps) out of
 * the text and parse only that.
 */
export function hanoiPm25Tail(text: string, keep = 600): { "PM2.5": unknown[] } {
  const key = text.indexOf('"PM2.5":[');
  if (key < 0) return { "PM2.5": [] };
  const start = key + '"PM2.5":['.length;
  const end = text.indexOf("]", start); // samples are flat objects: the first "]" closes the array
  if (end < 0) throw new Error("truncated dailystat");
  let from = end;
  for (let i = 0; i < keep; i++) {
    const p = text.lastIndexOf("{", from - 1);
    if (p < start) {
      from = start;
      break;
    }
    from = p;
  }
  const body = text.slice(from, end).trim().replace(/,$/, "");
  return { "PM2.5": body ? (JSON.parse(`[${body}]`) as unknown[]) : [] };
}

export class Poller {
  constructor(
    public states: Record<string, SrcState>,
    private fetchImpl: FetchLike,
    private now: number,
    private extraHeaders: (src: SourceDef) => Record<string, string> = () => ({}),
    private sources: Record<string, SourceDef> = SOURCES,
  ) {}

  st(id: string): SrcState {
    let s = this.states[id];
    if (!s) this.states[id] = s = newSrcState();
    s.okAt ??= {};
    return s;
  }

  src(id: string): SourceDef {
    const src = this.sources[id];
    if (!src) throw new Error(`Unknown source ${id}`);
    return src;
  }

  /** Throws before any network I/O if the URL is not on the source's allow-list. */
  assertAllowed(src: SourceDef, url: string): void {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new Error(`Not a URL: ${url}`);
    }
    if (u.protocol !== "https:" || !src.hosts.includes(u.hostname) || u.username || u.password)
      throw new Error(`Blocked: ${u.hostname} is not allow-listed for ${src.id}`);
  }

  callsLastHour(id: string): number {
    const s = this.st(id);
    s.calls = s.calls.filter((t) => this.now - t < HOUR);
    return s.calls.length;
  }

  /** Is a fresh payload due for (source, sub)? Also false while backing off or over the hourly budget. */
  due(id: string, sub = ""): boolean {
    const src = this.src(id);
    const s = this.st(id);
    const ok = s.okAt[sub];
    if (ok !== undefined && this.now - ok < ttlOf(src, this.now) - DUE_SLACK_MS) return false;
    return this.allowed(id);
  }

  /** Not backing off, and budget left this hour. */
  allowed(id: string): boolean {
    const src = this.src(id);
    return this.now >= this.st(id).blockedUntil && this.callsLastHour(id) < src.budgetPerHour;
  }

  /** One upstream call. Records success/failure in the source state; throws on failure. */
  async fetch<T = unknown>(id: string, url: string, sub = ""): Promise<PollOk<T>> {
    const src = this.src(id);
    this.assertAllowed(src, url);
    const s = this.st(id);
    const day = new Date(this.now).toISOString().slice(0, 10);
    if (s.day !== day) {
      s.day = day;
      s.callsToday = 0;
    }
    s.calls.push(this.now);
    s.callsToday++;
    try {
      const res = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(TIMEOUT_OVERRIDE[id] ?? src.timeoutMs ?? 10_000),
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...src.headers, ...this.extraHeaders(src) },
      });
      s.lastStatus = res.status;
      if (!res.ok) {
        const ra = Number(res.headers.get("retry-after"));
        throw Object.assign(new Error(`HTTP ${res.status}`), { retryAfter: Number.isFinite(ra) ? ra : undefined });
      }
      let data: unknown;
      if (id === "vn.hanoi.stat") data = await hanoiPm25TailStream(res.body);
      else {
        const text = await res.text();
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
      }
      if (src.reduce) data = src.reduce(data);
      s.failures = 0;
      s.blockedUntil = 0;
      s.lastOkAt = this.now;
      s.okAt[sub] = this.now;
      return { data: data as T, fetchedAt: this.now };
    } catch (e) {
      const err = e as Error & { retryAfter?: number; name?: string };
      const msg = err.name === "TimeoutError" || err.name === "AbortError" ? "timeout" : err.message;
      s.failures++;
      s.blockedUntil = this.now + backoffMs(s.failures, err.retryAfter);
      s.lastErrorAt = this.now;
      s.lastError = msg;
      throw new Error(msg);
    }
  }

  /** fetch() when due; null when not due (or blocked). Errors are recorded and returned as null too. */
  async poll<T = unknown>(id: string, url: string, sub = ""): Promise<PollOk<T> | null> {
    if (!this.due(id, sub)) return null;
    try {
      return await this.fetch<T>(id, url, sub);
    } catch {
      return null;
    }
  }

  /** The proxy's warning for a source whose last attempt failed (stale-if-error), or null. */
  warning(id: string, dataAt: number | null): string | null {
    const s = this.states[id];
    if (!s || s.lastErrorAt === null || (s.lastOkAt !== null && s.lastOkAt >= s.lastErrorAt)) return null;
    if (dataAt === null) return `${id}: ${s.lastError}; nothing cached`;
    return `${id}: ${s.lastError}; serving data fetched ${Math.round((this.now - dataAt) / 60_000)} min ago`;
  }
}

/** The proxy's /health entry for a source. */
export function sourceHealth(id: string, s: SrcState | undefined, now: number) {
  const src = SOURCES[id];
  const st = s ?? newSrcState();
  return {
    ok: st.lastError === null || (st.lastOkAt !== null && (st.lastErrorAt ?? 0) < st.lastOkAt),
    lastOkAt: st.lastOkAt ? new Date(st.lastOkAt).toISOString() : null,
    ageSec: st.lastOkAt ? Math.round((now - st.lastOkAt) / 1000) : null,
    lastError: st.lastError,
    lastErrorAt: st.lastErrorAt ? new Date(st.lastErrorAt).toISOString() : null,
    lastStatus: st.lastStatus,
    callsLastHour: st.calls.filter((t) => now - t < HOUR).length,
    callsToday: st.day === new Date(now).toISOString().slice(0, 10) ? st.callsToday : 0,
    budgetPerHour: src.budgetPerHour,
    ttlSec: Math.round(ttlOf(src, now) / 1000),
    backingOffUntil: st.blockedUntil > now ? new Date(st.blockedUntil).toISOString() : null,
    cadence: src.cadence,
  };
}
