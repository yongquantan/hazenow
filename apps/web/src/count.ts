/**
 * Counting, never identifying (docs/PRIVACY.md). One fire-and-forget beacon adds 1 to an aggregate counter on the
 * data server: /v1/hit?e=<event>&<dim>=<value>, where the event and every value come from a short fixed list (the
 * Worker rejects anything else). No identifier, place, coordinate or body is ever sent.
 *
 * "Once per day / week / device" is decided HERE, on the device, with a localStorage flag. The server can't tell two
 * beacons apart, by design. Off on localhost, in ?mock and ?embed=1 pages, and when the build has no data-server URL.
 * Shared by the web app and the site (apps/site imports it).
 */

export type Dims = Record<string, string>;

const env = import.meta.env as Record<string, string | undefined>;
const BASE = ((env.VITE_HIT_URL || env.VITE_PROXY_URL) ?? "").trim().replace(/\/$/, "");

function enabled(): boolean {
  if (!BASE) return false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("mock") || q.get("embed") === "1") return false;
    return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  } catch {
    return false;
  }
}

/** Send one +1. Never throws, never blocks, never retries. */
export function count(event: string, dims: Dims = {}): void {
  if (!enabled()) return;
  const q = new URLSearchParams({ e: event, ...dims });
  const url = `${BASE}/v1/hit?${q}`;
  try {
    if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true, mode: "no-cors", credentials: "omit" }).catch(() => {});
  } catch {
    /* never let counting break the page */
  }
}

/* ------------------------------------------------------------------ local flags (the device-side dedupe) */

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: may count again next visit, which is fine */
  }
};

/** True the first time `key` reaches `value` on this device (then remembers it). */
export function firstTime(key: string, value = "1"): boolean {
  if (get(key) === value) return false;
  set(key, value);
  return true;
}

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** ISO 8601 week, e.g. "2026-W41" (weeks start Monday, UTC). */
export function isoWeek(t = Date.now()): string {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export interface OpenInfo {
  /** First time this device is seen by the counters ("new"), else "returning". */
  seen: "new" | "returning";
  /** True when this device used HazeNow before counting existed (it has saved state but no first-seen flag). */
  preexisting: boolean;
}

/**
 * The web app opened: app_open once per UTC day, app_open_week once per ISO week, installed on the first launch from
 * the Home Screen. `hadState` says whether the device already had HazeNow data from before (so it isn't "new").
 */
export function countAppOpen(standalone: boolean, os: "ios" | "android" | "other", hadState: boolean, now = Date.now()): OpenInfo {
  const fresh = get("hn.m.first") === null;
  const preexisting = fresh && hadState;
  const seen = fresh && !hadState ? "new" : "returning";
  if (fresh) set("hn.m.first", utcDay(now));
  const surface = standalone ? "app" : "browser";
  if (firstTime("hn.m.day", utcDay(now))) count("app_open", { surface, seen });
  if (firstTime("hn.m.week", isoWeek(now))) count("app_open_week", { surface });
  if (standalone && firstTime("hn.m.installed")) count("installed", { os });
  return { seen, preexisting };
}
