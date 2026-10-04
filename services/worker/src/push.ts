/**
 * Opt-in Web Push haze alerts (free; works for iPhone Home Screen web apps on iOS 16.4+, and in Chrome, Edge,
 * Firefox and Android browsers).
 *
 *   POST /v1/push/subscribe    {subscription:{endpoint,keys:{p256dh,auth}}, place:{country,area|region}, prefs:{profiles,elevated}}
 *   POST /v1/push/unsubscribe  {endpoint}                     deletes the row; 200 even if it was already gone
 *   POST /v1/push/test         {endpoint}  + Bearer ADMIN_TOKEN   one test message to an existing subscriber (debug)
 *
 * Alerts: every minute, alongside the data jobs (index.ts), the cron checks whether NEA has a new hour in
 * D1 (the SG job's `sg:raw`). For each new hour it walks the subscribers in place order, builds each place's
 * snapshot with packages/core's buildSnapshot (the same IDW estimate the web app shows for that area), advances the
 * shared alert state machine (packages/core/src/alerts.ts, the native apps' rules) and sends what it says to send.
 * A pass is spread over as many minutes as it needs: at most SCAN_PER_RUN rows and SENDS_PER_RUN pushes per
 * invocation (the free plan allows 50 subrequests per invocation, shared with that minute's data job).
 *
 * Alerts cover Singapore only, like the native apps (SPEC v2.0 §3: crossing a border never fires an alert).
 *
 * Privacy: a row holds only the push endpoint and keys, the place (country + area/region id, never coordinates),
 * the prefs, the alert state and the creation day. The client IP is used only in memory for the per-isolate rate
 * limit, as in routes.ts. Nothing is logged.
 */
import { evaluateAlert, type AlertState, type BandAlert } from "../../../packages/core/src/alerts.js";
import { findArea, roundCoord } from "../../../packages/core/src/areas.js";
import type { RawResponses } from "../../../packages/core/src/client.js";
import { REGION_COORDS } from "../../../packages/core/src/constants.js";
import { normaliseProfile, type Profile } from "../../../packages/core/src/experience.js";
import { regionLabel } from "../../../packages/core/src/format.js";
import { buildSnapshot } from "../../../packages/core/src/snapshot.js";
import type { LocationQuery, Snapshot } from "../../../packages/core/src/types.js";
import { K, kvGet, kvPut, parseOr, type Env } from "./store.js";
import { sameSecret } from "./usage.js";
import { importVapidKey, sendPush, validKeys, vapidAuthorization, type FetchFn, type PushSubscriptionJSON, type Vapid } from "./webpush.js";

export interface PushEnv extends Env {
  /** VAPID public key (base64url, uncompressed P-256 point). A plain var: it is public, and the web app has it too. */
  VAPID_PUBLIC_KEY?: string;
  /** VAPID private key `d` (base64url). Secret: `wrangler secret put VAPID_PRIVATE_KEY`. */
  VAPID_PRIVATE_KEY?: string;
  /** VAPID contact (mailto: or https:). */
  VAPID_SUBJECT?: string;
}

/** Subscribers per place, and in all: a full pass must fit in about an hour of SENDS_PER_RUN-per-minute sends. */
export const MAX_PER_PLACE = 500;
export const MAX_TOTAL = 1200;
export const SCAN_PER_RUN = 200;
export const SENDS_PER_RUN = 25;
/** Seconds a push service may hold an alert for an offline phone. After 2 h a newer reading has replaced it. */
export const ALERT_TTL_S = 7200;
const RUN_KEY = "push:run";
/** Push services we send to. Anything else is refused, so the Worker can't be used to POST to arbitrary URLs. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

/* ------------------------------------------------------------------ places */

export type PushPlace = { country: "SG"; area: string } | { country: "SG"; region: string };

/** "SG:area:Tampines" | "SG:region:west" | "SG:island". */
export function placeKey(p: PushPlace): string {
  if ("area" in p) return `SG:area:${p.area}`;
  return p.region === "island" ? "SG:island" : `SG:region:${p.region}`;
}

export interface PlaceInfo {
  key: string;
  /** buildSnapshot query: the area's centroid rounded to 2 dp (exactly what the web app uses for a picked area). */
  query: LocationQuery;
  /** COPY §11 {area}: "Tampines" → "in Tampines". Regions and the island use the snapshot's own phrase. */
  placeName: string | null;
  /** Where a tap on the notification opens the web app. */
  url: string;
  label: string;
}

export function placeInfo(key: string): PlaceInfo | null {
  const [cc, kind, id] = key.split(":");
  if (cc !== "SG") return null;
  if (kind === "island") return { key, query: { region: "island" }, placeName: null, url: "/?region=island", label: "Singapore" };
  if (kind === "region" && id && id in REGION_COORDS) return { key, query: { region: id }, placeName: null, url: `/?region=${id}`, label: regionLabel(id) };
  if (kind === "area" && id) {
    const a = findArea(id);
    if (!a || a.name !== id) return null;
    return { key, query: { lat: roundCoord(a.lat), lon: roundCoord(a.lon) }, placeName: a.name, url: `/?area=${encodeURIComponent(a.name)}`, label: a.name };
  }
  return null;
}

/** Validate a client's place. Returns the canonical key, or an error message. */
export function parsePlace(p: unknown): { key: string } | { error: string; status: number } {
  if (!p || typeof p !== "object") return { error: "place is required", status: 400 };
  const o = p as Record<string, unknown>;
  if (String(o.country ?? "").toUpperCase() !== "SG") return { error: "Alerts cover Singapore only for now.", status: 422 };
  if (typeof o.area === "string" && o.area.trim()) {
    const a = findArea(o.area.trim());
    return a ? { key: `SG:area:${a.name}` } : { error: "Unknown area", status: 400 };
  }
  const r = String(o.region ?? "").toLowerCase();
  if (r === "island") return { key: "SG:island" };
  if (r in REGION_COORDS) return { key: `SG:region:${r}` };
  return { error: "place needs an area or a region", status: 400 };
}

export interface PushPrefs {
  profiles: Profile[];
  /** null = the COPY §11 default for the profiles. */
  elevated: boolean | null;
}

export function parsePrefs(p: unknown): PushPrefs {
  const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
  const profiles = normaliseProfile(Array.isArray(o.profiles) ? o.profiles.filter((x): x is string => typeof x === "string").slice(0, 10) : []);
  return { profiles, elevated: typeof o.elevated === "boolean" ? o.elevated : null };
}

export function validEndpoint(e: unknown): e is string {
  if (typeof e !== "string" || e.length > 1024) return false;
  try {
    const u = new URL(e);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((h) => h.test(u.hostname));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ HTTP */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

const out = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });

const hits = new Map<string, { at: number; n: number }>();
/** Per-isolate soft limit, 20 a minute per IP. The IP stays in memory for a minute and is never stored or logged. */
function limited(ip: string | null, now: number): boolean {
  if (!ip) return false;
  const h = hits.get(ip);
  if (!h || now - h.at >= 60_000) {
    hits.set(ip, { at: now, n: 1 });
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.at >= 60_000) hits.delete(k);
    return false;
  }
  return ++h.n > 20;
}

export function clearPushMemo() {
  hits.clear();
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > 4096) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

const dayStart = (now: number) => Math.floor(now / 86_400_000) * 86_400;

/** /v1/push/* (index.ts routes here before the read-only API). */
export async function handlePush(req: Request, env: PushEnv, opts: { now?: number; fetch?: FetchFn } = {}): Promise<Response> {
  const now = opts.now ?? Date.now();
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return out(405, { error: "Method not allowed" }, { allow: "POST, OPTIONS" });
  if (limited(req.headers.get("cf-connecting-ip"), now)) return out(429, { error: "Too many requests" }, { "retry-after": "60" });
  const body = await readJson(req);
  if (!body) return out(400, { error: "Send a JSON body" });
  const db = env.DB;

  if (path === "/v1/push/subscribe") {
    const sub = body.subscription as Partial<PushSubscriptionJSON> | undefined;
    if (!sub || !validEndpoint(sub.endpoint)) return out(400, { error: "subscription.endpoint must be a push service URL" });
    if (!validKeys(sub.keys)) return out(400, { error: "subscription.keys are missing or malformed" });
    const place = parsePlace(body.place);
    if ("error" in place) return out(place.status, { error: place.error });
    const prefs = JSON.stringify(parsePrefs(body.prefs));
    const counts = await db
      .prepare("SELECT (SELECT place FROM push_subs WHERE endpoint = ?1) AS mine, (SELECT COUNT(*) FROM push_subs) AS total, (SELECT COUNT(*) FROM push_subs WHERE place = ?2) AS here")
      .bind(sub.endpoint, place.key)
      .first<{ mine: string | null; total: number; here: number }>();
    const mine = counts?.mine ?? null;
    if (mine !== place.key) {
      if ((counts?.here ?? 0) >= MAX_PER_PLACE || (mine === null && (counts?.total ?? 0) >= MAX_TOTAL))
        return out(429, { error: "Alerts are full right now. Please try again in a few days." });
    }
    // Same place: keep the alert state (a re-sync must not re-announce). New place: start again, silently.
    await db
      .prepare(
        `INSERT INTO push_subs (endpoint, p256dh, auth, place, prefs, state, created_at) VALUES (?1, ?2, ?3, ?4, ?5, '{}', ?6)
         ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, prefs = excluded.prefs,
           state = CASE WHEN push_subs.place = excluded.place THEN push_subs.state ELSE '{}' END, place = excluded.place`,
      )
      .bind(sub.endpoint, sub.keys!.p256dh, sub.keys!.auth, place.key, prefs, dayStart(now))
      .run();
    const info = placeInfo(place.key)!;
    return out(200, { ok: true, place: place.key, label: info.label });
  }

  if (path === "/v1/push/unsubscribe") {
    const endpoint = body.endpoint;
    if (typeof endpoint !== "string" || !endpoint) return out(400, { error: "endpoint is required" });
    const r = await db.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(endpoint).run();
    return out(200, { ok: true, deleted: Number(r.meta?.changes ?? 0) });
  }

  if (path === "/v1/push/test") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!env.ADMIN_TOKEN) return out(404, { error: "Not found" });
    if (!sameSecret(token, env.ADMIN_TOKEN)) return out(401, { error: "Unauthorized" }, { "www-authenticate": "Bearer" });
    const vapid = vapidOf(env);
    if (!vapid) return out(503, { error: "VAPID keys are not configured" });
    const row = await db.prepare("SELECT endpoint, p256dh, auth, place FROM push_subs WHERE endpoint = ?1").bind(String(body.endpoint ?? "")).first<SubRow>();
    if (!row) return out(404, { error: "No such subscription" });
    const info = placeInfo(row.place);
    const signer = new Signer(vapid, now);
    const status = await deliver(row, { kind: "test", title: "HazeNow test alert", body: `Alerts work on this device. Tap to open ${info?.label ?? "HazeNow"}.` }, info?.url ?? "/", signer, opts.fetch);
    if (status === 404 || status === 410) await db.prepare("DELETE FROM push_subs WHERE endpoint = ?1").bind(row.endpoint).run();
    return out(200, { ok: status >= 200 && status < 300, status });
  }

  return out(404, { error: "Not found" });
}

/* ------------------------------------------------------------------ sending */

interface SubRow {
  id?: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  place: string;
  prefs?: string;
  state?: string;
}

function vapidOf(env: PushEnv): Vapid | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || "https://hazenow.pages.dev" };
}

/** One VAPID JWT per push service origin per invocation. */
class Signer {
  private key: Promise<CryptoKey> | null = null;
  private byOrigin = new Map<string, Promise<string>>();
  constructor(
    private vapid: Vapid,
    private now: number,
  ) {}
  auth(endpoint: string): Promise<string> {
    const origin = new URL(endpoint).origin;
    let a = this.byOrigin.get(origin);
    if (!a) {
      this.key ??= importVapidKey(this.vapid);
      a = this.key.then((k) => vapidAuthorization(this.vapid, k, origin, this.now));
      this.byOrigin.set(origin, a);
    }
    return a;
  }
}

/** What the service worker gets (apps/web/public/sw.js shows it; a tap opens `url`). */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  kind: string;
}

async function deliver(row: SubRow, alert: Pick<BandAlert, "title" | "body"> & { kind: string }, url: string, signer: Signer, fetchFn?: FetchFn): Promise<number> {
  const payload: PushPayload = { title: alert.title, body: alert.body, url, tag: "hazenow-band", kind: alert.kind };
  const urgent = alert.kind === "rising" && /High/.test(alert.title);
  return sendPush(
    { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
    JSON.stringify(payload),
    { ttl: ALERT_TTL_S, urgency: urgent ? "high" : "normal", topic: "hazenow-band" },
    await signer.auth(row.endpoint),
    fetchFn,
  );
}

/* ------------------------------------------------------------------ the hourly pass */

export interface PushRun {
  /** NEA hour (observedAt) this pass is for. */
  hour: string | null;
  /** `at` of the sg:raw row last looked at (skip work until the SG job writes it again). */
  rawAt: number;
  /** Cursor: last (place, id) handled. */
  place: string;
  id: number;
  done: boolean;
  sent: number;
  gone: number;
}

const newRun = (): PushRun => ({ hour: null, rawAt: 0, place: "", id: 0, done: true, sent: 0, gone: 0 });

/** State with `day` dropped when nothing was sent that day, so a new day alone never costs a D1 write. */
const stateKey = (s: AlertState) => JSON.stringify({ ...s, day: (s.sentToday ?? 0) > 0 ? s.day : undefined });

export interface PushRunResult {
  status: "no-keys" | "no-data" | "idle" | "stale" | "pass";
  hour?: string | null;
  scanned?: number;
  sent?: number;
  gone?: number;
  failed?: number;
  done?: boolean;
}

/** One cron invocation. */
export async function runPush(env: PushEnv, now: number, fetchFn?: FetchFn): Promise<PushRunResult> {
  const vapid = vapidOf(env);
  if (!vapid) return { status: "no-keys" };
  const db = env.DB;
  const heads = await db
    .prepare("SELECT k, at, CASE WHEN k = ?2 THEN v END AS v FROM kv WHERE k IN (?1, ?2)")
    .bind(K.sgRaw, RUN_KEY)
    .all<{ k: string; at: number; v: string | null }>();
  const rawHead = heads.results?.find((r) => r.k === K.sgRaw);
  const runRow = heads.results?.find((r) => r.k === RUN_KEY);
  let run: PushRun = runRow?.v ? { ...newRun(), ...parseOr<Partial<PushRun>>({ k: RUN_KEY, v: runRow.v, at: 0, status: 200 }, {}) } : newRun();
  if (!rawHead) return { status: "no-data" };
  if (run.done && run.rawAt === rawHead.at) return { status: "idle", hour: run.hour };

  const raw = parseOr<RawResponses | null>(await kvGet(db, K.sgRaw), null);
  let island: Snapshot | null = null;
  try {
    island = raw ? buildSnapshot(raw, { region: "island" }, now) : null;
  } catch {
    island = null;
  }
  if (!raw || !island) {
    await kvPut(db, RUN_KEY, JSON.stringify({ ...run, rawAt: rawHead.at }), now).run();
    return { status: "no-data" };
  }
  if (island.observedAt !== run.hour) run = { ...newRun(), hour: island.observedAt, done: false };
  run.rawAt = rawHead.at;
  // A stale hour (NEA late for 2 h+) never alerts; wait for the next one.
  if (run.done || island.stale) {
    run.done = true;
    await kvPut(db, RUN_KEY, JSON.stringify(run), now).run();
    return { status: run.done && !island.stale ? "idle" : "stale", hour: run.hour };
  }

  const rows =
    (
      await db
        .prepare("SELECT id, endpoint, p256dh, auth, place, prefs, state FROM push_subs WHERE place > ?1 OR (place = ?1 AND id > ?2) ORDER BY place, id LIMIT ?3")
        .bind(run.place, run.id, SCAN_PER_RUN)
        .all<Required<SubRow>>()
    ).results ?? [];

  const snaps = new Map<string, Snapshot | null>();
  const snapFor = (key: string, info: PlaceInfo): Snapshot | null => {
    if (!snaps.has(key)) {
      let s: Snapshot | null = null;
      try {
        s = buildSnapshot(raw, info.query, now);
      } catch {
        s = null;
      }
      snaps.set(key, s);
    }
    return snaps.get(key)!;
  };

  const signer = new Signer(vapid, now);
  const writes: D1PreparedStatement[] = [];
  const sends: { row: Required<SubRow>; alert: BandAlert; url: string; next: string }[] = [];
  let scanned = 0;
  let stoppedEarly = false;
  for (const row of rows) {
    const info = placeInfo(row.place);
    const snap = info ? snapFor(row.place, info) : null;
    if (info && snap) {
      const prev = parseOr<AlertState>({ k: "", v: row.state, at: 0, status: 200 }, {});
      const prefs = parseOr<Partial<PushPrefs>>({ k: "", v: row.prefs, at: 0, status: 200 }, {});
      const { state, alert } = evaluateAlert(prev, snap, { profiles: prefs.profiles, elevated: prefs.elevated ?? null, placeName: info.placeName }, now);
      if (alert) {
        if (sends.length >= SENDS_PER_RUN) {
          stoppedEarly = true; // this row (and the rest) next minute
          break;
        }
        sends.push({ row, alert, url: info.url, next: JSON.stringify(state) });
      } else if (stateKey(state) !== stateKey(prev)) {
        writes.push(db.prepare("UPDATE push_subs SET state = ?1 WHERE id = ?2").bind(JSON.stringify(state), row.id));
      }
    }
    run.place = row.place;
    run.id = row.id;
    scanned++;
  }

  let failed = 0;
  const results = await Promise.all(sends.map((s) => deliver(s.row, s.alert, s.url, signer, fetchFn)));
  results.forEach((status, i) => {
    const s = sends[i];
    if (status === 404 || status === 410) {
      writes.push(db.prepare("DELETE FROM push_subs WHERE id = ?1").bind(s.row.id));
      run.gone++;
    } else if (status >= 200 && status < 300) {
      writes.push(db.prepare("UPDATE push_subs SET state = ?1 WHERE id = ?2").bind(s.next, s.row.id));
      run.sent++;
    } else {
      // Not delivered (429, 5xx, network): keep the old state, so the next hour decides again.
      failed++;
    }
  });
  run.done = !stoppedEarly && rows.length < SCAN_PER_RUN;
  writes.push(kvPut(db, RUN_KEY, JSON.stringify(run), now));
  await db.batch(writes);
  return { status: "pass", hour: run.hour, scanned, sent: run.sent, gone: run.gone, failed, done: run.done };
}
