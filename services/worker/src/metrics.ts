/**
 * Product metrics: count, never identify (docs/PRIVACY.md lists every counter).
 *
 * The site and web app send fire-and-forget beacons to /v1/hit?e=<event>&<dim>=<value>. Each one adds 1 to a
 * (UTC day, event, country, a, b) counter, where event, a and b come from the fixed allow-list below. Anything else
 * (an unknown event, an unknown or missing dimension, a value off the list, an extra parameter) is rejected with 400,
 * so free text, ids or coordinates can never end up in a counter. Country is Cloudflare's request.cf.country, and
 * only for events marked `country: true`.
 *
 * "Once per day / week / device" is decided on the device (a localStorage flag), never here: the server can't tell
 * two beacons apart, by design.
 */
import { COUNTRIES } from "../../../packages/core/src/countries/index.js";
import { bump, countShareLanding, CARDS } from "./usage.js";

interface Spec {
  /** Up to two dimensions, in column order (a, b). Each value must be on its list. */
  dims: readonly (readonly [name: string, values: readonly string[]])[];
  /** Record Cloudflare's two-letter country with the count. */
  country: boolean;
  /** What it means, for the dashboard and docs/PRIVACY.md. */
  means: string;
}

/** Where the app was opened: the installed web app (Home Screen), a browser tab, or a native app. */
const WEB = ["app", "browser"] as const;
const NATIVE = ["android", "ios", "mac"] as const;
const VIA = ["location", "typed", "list", "saved", "link", "guess"] as const; // how the place was found

export const EVENTS: Record<string, Spec> = {
  app_open: {
    dims: [["surface", [...WEB, ...NATIVE]], ["seen", ["new", "returning"]]],
    country: true,
    means: "HazeNow opened, once per device per UTC day (daily active devices), by surface. Native apps send the selected place's country (cc=) instead",
  },
  app_open_week: { dims: [["surface", WEB]], country: true, means: "The web app opened, once per device per ISO week (weekly active devices)" },
  eureka: { dims: [["via", VIA]], country: true, means: "The first verdict ever shown on a device" },
  place_set: { dims: [["via", ["location", "typed", "list", "saved"]]], country: false, means: "Someone picked a place, by method" },
  share_sent: { dims: [["card", CARDS], ["via", ["share", "download", "copy_text", "copy_link"]]], country: true, means: "A share card was sent, downloaded or copied" },
  install_prompt_shown: { dims: [["kind", ["coach", "inapp"]]], country: true, means: "An install hint was shown (iPhone coach mark, or the in-app-browser strip)" },
  installed: { dims: [["os", ["ios", "android", "other"]]], country: true, means: "The installed web app opened for the first time on a device" },
  alerts_on: { dims: [], country: true, means: "Haze alerts were turned on" },
  alerts_off: { dims: [], country: true, means: "Haze alerts were turned off" },
  download_click: {
    dims: [["platform", ["android", "mac", "cli", "scriptable", "scriptable_js", "home_assistant", "swiftbar", "shell", "iphone_web", "android_web"]]],
    country: true,
    means: "A download or install button on /download/ or the site was clicked",
  },
  qr_shown: { dims: [], country: true, means: "The desktop 'scan to open on your phone' QR code was shown" },
  scriptable_file: { dims: [], country: false, means: "/widget/HazeNow.scriptable was served (counted by the site's Pages Function)" },
};

export type HitResult = { ok: true; event: string } | { ok: false; error: string };

/** Validate a /v1/hit query and count it. Only allow-listed names and values ever reach a counter. */
export function countHit(params: URLSearchParams, country: string, now: number): HitResult {
  const e = params.get("e") ?? "";
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) return { ok: false, error: "Each parameter once" };
  if (e === "share_landing") {
    // The original share-card counter (usage.ts, its own table), unchanged.
    const card = params.get("card");
    if (keys.length !== 2 || !CARDS.includes(card as (typeof CARDS)[number])) return { ok: false, error: `share_landing needs card=${CARDS.join("|")}` };
    countShareLanding(card!, country, now);
    return { ok: true, event: e };
  }
  const spec = Object.hasOwn(EVENTS, e) ? EVENTS[e] : undefined;
  if (!spec) return { ok: false, error: `e must be one of share_landing|${Object.keys(EVENTS).join("|")}` };
  // Native apps (no browser, so no meaningful request country) send the selected place's covered country instead.
  let cc: string | null = null;
  if (e === "app_open" && NATIVE.includes(params.get("surface") as (typeof NATIVE)[number]) && params.has("cc")) {
    cc = params.get("cc")!.toUpperCase();
    if (!(cc in COUNTRIES)) return { ok: false, error: `cc must be one of ${Object.keys(COUNTRIES).join("|").toLowerCase()}` };
  }
  if (keys.length !== 1 + spec.dims.length + (cc ? 1 : 0)) return { ok: false, error: `${e} takes ${spec.dims.map(([d]) => d).join(", ") || "no other parameters"}` };
  const cols: string[] = [];
  for (const [name, values] of spec.dims) {
    const v = params.get(name);
    if (v === null || !values.includes(v)) return { ok: false, error: `${name} must be ${values.join("|")}` };
    cols.push(v);
  }
  while (cols.length < 2) cols.push("");
  bump("metric_daily", new Date(now).toISOString().slice(0, 10), e, spec.country ? (cc ?? country) : "", cols[0], cols[1]);
  return { ok: true, event: e };
}

/* ------------------------------------------------------------------ reading */

type Counts = Record<string, number>;
export interface EventStats {
  total: number;
  /** day → n */
  days: Counts;
  /** first dimension value → n, and per day */
  a: Counts;
  aDays: Record<string, Counts>;
  /** second dimension value → n */
  b: Counts;
  countries: Counts;
}

const add = (o: Counts, k: string, n: number) => (o[k] = (o[k] ?? 0) + n);

export async function readEvents(db: D1Database, from: string): Promise<Record<string, EventStats>> {
  const r = await db
    .prepare("SELECT day, event, country, a, b, n FROM metric_daily WHERE day >= ?1")
    .bind(from)
    .all<{ day: string; event: string; country: string; a: string; b: string; n: number }>();
  const out: Record<string, EventStats> = {};
  for (const e of Object.keys(EVENTS)) out[e] = { total: 0, days: {}, a: {}, aDays: {}, b: {}, countries: {} };
  for (const row of r.results ?? []) {
    const s = (out[row.event] ??= { total: 0, days: {}, a: {}, aDays: {}, b: {}, countries: {} });
    s.total += row.n;
    add(s.days, row.day, row.n);
    if (row.a) {
      add(s.a, row.a, row.n);
      add((s.aDays[row.a] ??= {}), row.day, row.n);
    }
    if (row.b) add(s.b, row.b, row.n);
    if (row.country) add(s.countries, row.country, row.n);
  }
  return out;
}

/* ------------------------------------------------------------------ web visits (Cloudflare Web Analytics) */

export const ACCOUNT_ID = "cd79508c2b4a1c05d7b63f4646ceb1a5";
export const PAGES_HOSTS = ["hazenow.pages.dev", "hazenow-app.pages.dev"] as const;
let visitsMemo: { key: string; at: number; v: Visits } | null = null;

export type Visits =
  | { available: true; total: number; pageViews: number; hosts: Record<string, { visits: number; days: Counts }> }
  | { available: false; reason: string; enableUrl: string };

const ENABLE_URL = `https://dash.cloudflare.com/${ACCOUNT_ID}/web-analytics`;

/** Visits per host and day from Cloudflare's GraphQL API (Web Analytics, cookieless). Needs CF_ANALYTICS_TOKEN. */
export async function readVisits(token: string | undefined, from: string, now: number, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<Visits> {
  if (!token) return { available: false, reason: "No CF_ANALYTICS_TOKEN secret (Account Analytics: Read) on the Worker", enableUrl: ENABLE_URL };
  if (visitsMemo && visitsMemo.key === from && now - visitsMemo.at < 10 * 60_000) return visitsMemo.v;
  const query = `query($a: String!, $s: Date!, $h: [String!]) { viewer { accounts(filter: {accountTag: $a}) {
    rumPageloadEventsAdaptiveGroups(limit: 5000, filter: {date_geq: $s, requestHost_in: $h}, orderBy: [date_ASC]) {
      count sum { visits } dimensions { date requestHost } } } } }`;
  try {
    const res = await fetchFn("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { a: ACCOUNT_ID, s: from, h: PAGES_HOSTS } }),
    });
    const j = (await res.json()) as {
      errors?: { message: string }[] | null;
      data?: { viewer: { accounts: { rumPageloadEventsAdaptiveGroups: { count: number; sum: { visits: number }; dimensions: { date: string; requestHost: string } }[] }[] } };
    };
    if (j.errors?.length) return { available: false, reason: j.errors[0].message, enableUrl: ENABLE_URL };
    const groups = j.data?.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups ?? [];
    const hosts: Record<string, { visits: number; days: Counts }> = {};
    for (const h of PAGES_HOSTS) hosts[h] = { visits: 0, days: {} };
    let total = 0;
    let pageViews = 0;
    for (const g of groups) {
      const h = (hosts[g.dimensions.requestHost] ??= { visits: 0, days: {} });
      h.visits += g.sum.visits;
      add(h.days, g.dimensions.date, g.sum.visits);
      total += g.sum.visits;
      pageViews += g.count;
    }
    const v: Visits = { available: true, total, pageViews, hosts };
    visitsMemo = { key: from, at: now, v };
    return v;
  } catch (e) {
    return { available: false, reason: `GraphQL request failed: ${(e as Error).message}`, enableUrl: ENABLE_URL };
  }
}

/* ------------------------------------------------------------------ funnel */

/** The headline funnel for the window, from the totals above. */
export function funnel(events: Record<string, EventStats>, shareLandings: number, visits: Visits) {
  const t = (e: string) => events[e]?.total ?? 0;
  const eureka = t("eureka");
  const shares = t("share_sent");
  return {
    steps: [
      { id: "visits", label: "Site visits", n: visits.available ? visits.total : null },
      { id: "share_landings", label: "Share landings", n: shareLandings },
      { id: "app_open", label: "App opens (device-days)", n: t("app_open") },
      { id: "eureka", label: "First verdicts", n: eureka },
      { id: "installed", label: "Installs", n: t("installed") },
      { id: "share_sent", label: "Shares sent", n: shares },
      { id: "alerts_on", label: "Alerts on", n: t("alerts_on") },
    ],
    /** Shares sent ÷ first verdicts: how often a new person passes it on (roughly; shares come from old users too). */
    sharesPerEureka: eureka ? Math.round((shares / eureka) * 100) / 100 : null,
    /** Share landings ÷ shares sent: people reached per share. */
    landingsPerShare: shares ? Math.round((shareLandings / shares) * 100) / 100 : null,
  };
}
