/**
 * Aggregate usage counters: how many /v1/* requests per (UTC day, country, endpoint), and how many share-card
 * landings per (UTC day, card, country). Counts only. Nothing here sees or stores an IP, a user agent, a
 * coordinate, a query string or any identifier: the inputs are a fixed endpoint label, a fixed card id and
 * Cloudflare's two-letter request.cf.country.
 *
 * Writes are batched per isolate: counts go into memory and one batch of upserts runs a few seconds later inside
 * ctx.waitUntil (one row write per distinct key, not per request), so the counters can't eat the D1 free tier's
 * 100k rows/day that the cron jobs need.
 */
import { COUNTRIES } from "../../../packages/core/src/countries/index.js";

export const CARDS = ["now", "clocks", "group", "clear"] as const;
export const EVENTS = ["share_landing"] as const;
export const FLUSH_DELAY_MS = 5_000;

const DAY = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Cloudflare's country code, or "XX". "T1" (Tor) and other two-character codes pass through as-is. */
export function countryCode(c: unknown): string {
  return typeof c === "string" && /^[A-Z][A-Z0-9]$/.test(c) ? c : "XX";
}

/** A fixed label for a /v1/* path (never a value from the URL), or null when the path isn't counted. */
export function endpointLabel(path: string): string | null {
  if (!path.startsWith("/v1/")) return null;
  if (path === "/v1/hit" || path === "/v1/stats") return null;
  if (path === "/v1/countries" || path === "/v1/scales") return path.slice(4);
  let m = /^\/v1\/sg\/nea\/(pm25|psi)$/.exec(path);
  if (m) return `sg/nea/${m[1]}`;
  if (/^\/v1\/sensors\/[^/]+\/uptime$/.test(path)) return "sensors/uptime";
  m = /^\/v1\/([a-z]{2}|auto)\/(observations|snapshot)$/.exec(path);
  if (m && (m[1] === "auto" || m[1].toUpperCase() in COUNTRIES)) return `${m[1]}/${m[2]}`;
  return "other";
}

type Table = "usage_daily" | "share_landings";
const buf = new Map<string, number>(); // `${table}\t${day}\t${a}\t${b}` → count
let pending: Promise<void> | null = null;

function bump(table: Table, day: string, a: string, b: string) {
  const k = `${table}\t${day}\t${a}\t${b}`;
  buf.set(k, (buf.get(k) ?? 0) + 1);
}

export function countRequest(endpoint: string, country: string, now: number) {
  bump("usage_daily", DAY(now), country, endpoint);
}

export function countShareLanding(card: string, country: string, now: number) {
  bump("share_landings", DAY(now), card, country);
}

const SQL: Record<Table, string> = {
  usage_daily: "INSERT INTO usage_daily (day, country, endpoint, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, country, endpoint) DO UPDATE SET n = n + excluded.n",
  share_landings: "INSERT INTO share_landings (day, card, country, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, card, country) DO UPDATE SET n = n + excluded.n",
};

/** Write everything buffered in this isolate (one upsert per key). On failure the counts go back into the buffer. */
export async function flushUsage(db: D1Database): Promise<void> {
  if (!buf.size) return;
  const items = [...buf.entries()];
  buf.clear();
  try {
    await db.batch(items.map(([k, n]) => {
      const [table, day, a, b] = k.split("\t") as [Table, string, string, string];
      return db.prepare(SQL[table]).bind(day, a, b, n);
    }));
  } catch {
    for (const [k, n] of items) buf.set(k, (buf.get(k) ?? 0) + n);
  }
}

/** A flush a few seconds from now, unless one is already scheduled in this isolate. Pass it to ctx.waitUntil. */
export function scheduleFlush(db: D1Database, delayMs = FLUSH_DELAY_MS): Promise<void> | null {
  if (!buf.size || pending) return null;
  pending = new Promise<void>((r) => setTimeout(r, delayMs))
    .then(() => flushUsage(db))
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function clearUsageBuffer() {
  buf.clear();
  pending = null;
}

export interface DayRow {
  day: string;
  total: number;
  [k: string]: unknown;
}

/** Daily totals for the last `days` UTC days (inclusive of today). */
export async function readStats(db: D1Database, days: number, now: number) {
  const from = DAY(now - (days - 1) * 86_400_000);
  const u = await db
    .prepare("SELECT day, country, endpoint, n FROM usage_daily WHERE day >= ?1 ORDER BY day")
    .bind(from)
    .all<{ day: string; country: string; endpoint: string; n: number }>();
  const s = await db
    .prepare("SELECT day, card, country, n FROM share_landings WHERE day >= ?1 ORDER BY day")
    .bind(from)
    .all<{ day: string; card: string; country: string; n: number }>();
  const add = (o: Record<string, number>, k: string, n: number) => (o[k] = (o[k] ?? 0) + n);
  const usage = new Map<string, { day: string; total: number; countries: Record<string, number>; endpoints: Record<string, number> }>();
  for (const r of u.results ?? []) {
    const d = usage.get(r.day) ?? { day: r.day, total: 0, countries: {}, endpoints: {} };
    d.total += r.n;
    add(d.countries, r.country, r.n);
    add(d.endpoints, r.endpoint, r.n);
    usage.set(r.day, d);
  }
  const share = new Map<string, { day: string; total: number; cards: Record<string, number>; countries: Record<string, number> }>();
  for (const r of s.results ?? []) {
    const d = share.get(r.day) ?? { day: r.day, total: 0, cards: {}, countries: {} };
    d.total += r.n;
    add(d.cards, r.card, r.n);
    add(d.countries, r.country, r.n);
    share.set(r.day, d);
  }
  const sum = <T extends { total: number }>(m: Map<string, T>) => [...m.values()].reduce((a, d) => a + d.total, 0);
  return {
    from,
    to: DAY(now),
    days,
    totals: { requests: sum(usage), shareLandings: sum(share) },
    usage: [...usage.values()],
    shareLandings: [...share.values()],
  };
}

/** Constant-time string compare (the bearer token). */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
