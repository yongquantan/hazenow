// HazeNow Telegram bot: Cloudflare Worker, webhook mode. MIT licensed.
// Copy follows docs/COPY.md verbatim. No Instant PSI anywhere (SPEC v1.2 #1).
//   /now [region]    verdict + PM2.5 right now (default central)
//   📍 location      reading estimated for that spot (used once; only stored if you set an alert for it)
//   /profile [who]   general | kids | elderly | pregnant | heart_lung | exercising | outdoor_worker
//   /alert [region] [all]   band-change alerts (hysteresis, max 3/day, all-clear always, quiet hours + morning catch-up)
//   /quiet 22-7 | off,  /stop
import {
  ANCHOR,
  BANDS,
  CHART_CAPTION,
  CHART_TITLE,
  FOOTER,
  FORECAST_TIP,
  FORECAST_URL,
  FOR_LABEL,
  OFFICIAL_CAPTION,
  PRIVACY,
  PROFILES,
  REGIONS,
  REGIONS_HEADING,
  WHY_SHORT,
  actionsFor,
  areaOf,
  arrowOf,
  bandOf,
  bandRank,
  buildSnapshot,
  displayNumber,
  fetchRaw,
  notifyClear,
  notifyEase,
  notifyMorning,
  notifyRise,
  officialLine,
  provenance,
  regionRow,
  secondLine,
  sgtDate,
  sparkPair,
  timeLabel,
  title,
  trendPhrase,
  uncertaintyLine,
  verdictLong,
  type ApiData,
  type Band,
  type LatLon,
  type Profile,
  type RawData,
  type Snapshot,
} from "./haze.ts";

export interface Env {
  HAZENOW_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  /** Random string; passed to setWebhook as secret_token and checked on every update. */
  WEBHOOK_SECRET: string;
  /** Optional data.gov.sg API key (x-api-key) for higher rate limits. Keyless works but Workers share egress IPs. */
  DATA_GOV_API_KEY?: string;
  WEB_URL?: string;
}

// ------------------------------------------------------------------ data (cached in KV: data.gov.sg rate-limits keyless bursts)
const RAW_KEY = "cache:raw";
const RAW_TTL_MS = 5 * 60_000;

async function getRaw(env: Env, maxAgeMs = RAW_TTL_MS): Promise<RawData> {
  const cached = await env.HAZENOW_KV.get<{ at: number; raw: RawData }>(RAW_KEY, "json");
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.raw;
  const fetchImpl: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("user-agent", "HazeNow-TelegramBot/0.1");
    if (env.DATA_GOV_API_KEY) headers.set("x-api-key", env.DATA_GOV_API_KEY);
    return fetch(input, { ...init, headers });
  };
  // Past days don't change: keep yesterday's payloads in KV for a day.
  const yKey = `cache:day:${sgtDate(1)}`;
  const yesterday = (await env.HAZENOW_KV.get<{ pm?: ApiData; psi?: ApiData }>(yKey, "json")) ?? undefined;
  try {
    const raw = await fetchRaw({ fetchImpl, yesterday });
    await env.HAZENOW_KV.put(RAW_KEY, JSON.stringify({ at: Date.now(), raw }), { expirationTtl: 6 * 3600 });
    if (!yesterday && raw.pm[1]) {
      await env.HAZENOW_KV.put(yKey, JSON.stringify({ pm: raw.pm[1], psi: raw.psi[1] }), { expirationTtl: 2 * 86400 });
    }
    return raw;
  } catch (e) {
    if (cached) return cached.raw; // serve stale rather than fail; the snapshot's `stale` flag tells the user
    throw e;
  }
}

// ------------------------------------------------------------------ telegram
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  location?: { latitude: number; longitude: number };
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; data?: string; message?: TgMessage };
};

async function tg(env: Env, method: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function send(env: Env, chatId: number, html: string, extra: Record<string, unknown> = {}) {
  return tg(env, "sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

const LOCATION_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: "📍 Share my location", request_location: true }], [{ text: "/now" }, { text: "/alert" }]],
    resize_keyboard: true,
  },
};

// ------------------------------------------------------------------ /now formatting (verdict first; COPY.md)
export function formatNow(s: Snapshot, where: string, profile: Profile = "general"): string {
  const b = BANDS[s.band];
  const second = secondLine(s);
  const unc = uncertaintyLine(s);
  const chart = sparkPair(s);
  const lines = [
    `${b.emoji} <b>${esc(verdictLong(s.band, profile))}</b>`,
    `${esc(FOR_LABEL[profile])} · ${esc(where)}`,
    ...(second ? [esc(second)] : []),
    "",
    `<b>${displayNumber(s)}</b> PM2.5 · ${b.glyph} ${b.label} ${arrowOf(s.trend.direction)}`,
    esc(trendPhrase(s.history).words),
    esc(ANCHOR[s.band]),
    ...(unc ? [esc(unc)] : []),
    `<i>${esc(provenance(s))}</i>`,
    "",
    "<b>What you can do</b>",
    ...actionsFor(s, profile).map((a) => `• ${esc(a)}`),
    "",
    `${esc(officialLine(s))} · ${OFFICIAL_CAPTION}`,
    `<i>${esc(WHY_SHORT)}</i>`,
    "",
    `<b>${CHART_TITLE}</b> (µg/m³)`,
    `<code>hourly PM2.5  ${chart.hourly}</code>`,
    `<code>NEA 24-hr avg ${chart.daily}</code>`,
    `<i>${esc(CHART_CAPTION)}</i>`,
    "",
    `<a href="${FORECAST_URL}">${esc(FORECAST_TIP)}</a>`,
    `<i>${esc(FOOTER)}</i>`,
  ];
  return lines.join("\n");
}

function formatRegions(raw: RawData): string {
  const s = buildSnapshot(raw, "central");
  const rows = REGIONS.map((k) => {
    const v = s.regions[k]?.pm25;
    const g = v == null ? "○" : BANDS[bandOf(v)].glyph;
    return `${g} ${esc(regionRow({ ...s, locationMode: "island" }, k))}`;
  });
  return [`<b>${REGIONS_HEADING}</b>`, ...rows, "", `<i>measured ${timeLabel(s.observedAt)} · Data: NEA via data.gov.sg</i>`].join("\n");
}

const HELP = [
  "<b>HazeNow</b>: Singapore haze right now, from NEA's 1-hr PM2.5.",
  "",
  "/now for Central, or <code>/now west</code> (north, south, east, west, island)",
  "/regions for every area at a glance",
  "📍 Share your location for a reading estimated for your spot",
  "/profile to get advice that fits: <code>/profile kids</code> (general, kids, elderly, pregnant, heart_lung, exercising, outdoor_worker)",
  "/alert [region] for a message when the band changes near you, and when it's clear again. Never at night.",
  "/quiet 22-7 to change quiet hours · /stop to turn alerts off",
  "",
  esc(WHY_SHORT),
  "It's not medical advice, and it's not an official NEA app. If you feel unwell, see a doctor. In an emergency, call 995.",
  "",
  `<i>${esc(PRIVACY)}</i>`,
  `<i>${esc(FOOTER)}</i>`,
].join("\n");

// ------------------------------------------------------------------ subscriptions: hysteresis, caps, quiet hours, catch-up
export type Sub = {
  chatId: number;
  region?: string;
  loc?: LatLon;
  profile: Profile;
  elevatedOptIn: boolean; // COPY §11: Elevated alerts are opt-in for `general`
  band?: Band; // confirmed band
  pending?: { band: Band; hours: number };
  lastObservedAt?: string;
  alerted: boolean; // we told them about the current episode → they get easing + all-clear
  quiet: [number, number]; // SGT hours [start, end)
  day?: string; // SGT date of sentCount
  sentCount: number; // rise/ease/morning messages today (all-clear is exempt)
  overnightPeak?: Band; // band changed during quiet hours → morning catch-up
};

const DAILY_CAP = 3;
const UPPER: Record<Band, number> = { normal: 55, elevated: 150, high: 250, very_high: Infinity };
const BAND_ORDER: Band[] = ["normal", "elevated", "high", "very_high"];
// Elevated alerts on by default for sensitive, exercise and outdoor-work profiles (hours of exposure); opt-in for general.
const SENSITIVE_OR_EXERCISE: Profile[] = ["kids", "elderly", "pregnant", "heart_lung", "exercising", "outdoor_worker"];

export const alertThreshold = (sub: Pick<Sub, "profile" | "elevatedOptIn">): Band =>
  sub.elevatedOptIn || SENSITIVE_OR_EXERCISE.includes(sub.profile) ? "elevated" : "high";

export function inQuiet(quiet: [number, number], now: Date): boolean {
  const h = new Date(now.getTime() + 8 * 3600_000).getUTCHours();
  const [a, b] = quiet;
  if (a === b) return false;
  return a < b ? h >= a && h < b : h >= a || h < b;
}

export type AlertEvent = { kind: "rise" | "ease" | "clear" | "morning"; band: Band; peak?: Band };

/**
 * Pure decision function.
 * Hysteresis (SPEC v1.1 §10): a band change is confirmed when it holds 2 consecutive hours OR clears the boundary by ≥10.
 * Then (COPY §11): rises notify at/above the profile threshold; easing + all-clear go to anyone we alerted this episode;
 * max 3 per SGT day except the all-clear; in quiet hours changes are recorded and summarised in a morning catch-up.
 */
export function decide(sub: Sub, pm25: number, observedAt: string, now: Date): { event: AlertEvent | null; sub: Sub } {
  const next: Sub = { ...sub };
  const today = sgtDate(0, now);
  if (next.day !== today) {
    next.day = today;
    next.sentCount = 0;
  }
  const quiet = inQuiet(next.quiet, now);
  const cand = bandOf(pm25);
  const prev = next.band;

  // 1. hysteresis → confirmed band change?
  let changed = false;
  if (!prev) {
    next.band = cand;
  } else if (cand === prev) {
    next.pending = undefined;
  } else {
    const newHour = observedAt !== sub.lastObservedAt;
    const up = bandRank(cand) > bandRank(prev);
    const boundary = up ? UPPER[prev] : UPPER[BAND_ORDER[bandRank(prev) - 1]];
    const hours = next.pending?.band === cand ? next.pending.hours + (newHour ? 1 : 0) : 1;
    next.pending = { band: cand, hours };
    if (Math.abs(pm25 - boundary) >= 10 || hours >= 2) {
      next.band = cand;
      next.pending = undefined;
      changed = true;
    }
  }
  next.lastObservedAt = observedAt;
  const band = next.band as Band;
  const threshold = alertThreshold(next);
  const capOk = next.sentCount < DAILY_CAP;

  // 2. quiet hours: record, don't send
  if (quiet) {
    if (changed) {
      const peakSoFar = next.overnightPeak ?? prev ?? band;
      next.overnightPeak = bandRank(band) > bandRank(peakSoFar) ? band : peakSoFar;
    }
    return { event: null, sub: next };
  }

  // 3. first run after quiet hours: morning catch-up
  if (next.overnightPeak) {
    const peak = next.overnightPeak;
    next.overnightPeak = undefined;
    if (next.alerted || bandRank(peak) >= bandRank(threshold)) {
      next.alerted = band !== "normal" && (next.alerted || bandRank(band) >= bandRank(threshold));
      next.sentCount++;
      return { event: { kind: "morning", band, peak }, sub: next };
    }
  }

  if (!changed || !prev) return { event: null, sub: next };

  if (bandRank(band) > bandRank(prev)) {
    if (bandRank(band) >= bandRank(threshold) && capOk) {
      next.alerted = true;
      next.sentCount++;
      return { event: { kind: "rise", band }, sub: next };
    }
    return { event: null, sub: next };
  }
  if (band === "normal") {
    const was = next.alerted;
    next.alerted = false;
    return { event: was ? { kind: "clear", band } : null, sub: next }; // all-clear always gets through
  }
  if (next.alerted && capOk) {
    next.sentCount++;
    return { event: { kind: "ease", band }, sub: next };
  }
  return { event: null, sub: next };
}

export function alertText(ev: AlertEvent, s: Snapshot, area: string, profile: Profile): string {
  const m =
    ev.kind === "rise"
      ? notifyRise(ev.band, area, s.pm25, profile)
      : ev.kind === "ease"
        ? notifyEase(ev.band, area, s.pm25, profile)
        : ev.kind === "clear"
          ? notifyClear(area, s.pm25, profile)
          : notifyMorning(ev.peak ?? ev.band, s, profile);
  return `${BANDS[s.band].emoji} <b>${esc(m.title)}</b>\n${esc(m.body)}\n\n<i>Data: NEA via data.gov.sg · /now for details · /stop to turn off</i>`;
}

const subKey = (chatId: number) => `sub:${chatId}`;
const profKey = (chatId: number) => `prof:${chatId}`;
export const areaFor = (sub: Pick<Sub, "region" | "loc">) =>
  sub.loc ? areaOf("gps") : areaOf(sub.region === "island" ? "island" : "region", sub.region ?? "central");

async function checkAlerts(env: Env): Promise<void> {
  const raw = await getRaw(env, 60_000);
  const now = new Date();
  let cursor: string | undefined;
  do {
    const page = await env.HAZENOW_KV.list({ prefix: "sub:", cursor });
    for (const k of page.keys) {
      const sub = await env.HAZENOW_KV.get<Sub>(k.name, "json");
      if (!sub) continue;
      const s = buildSnapshot(raw, sub.region ?? "central", sub.loc, now);
      if (s.stale) continue;
      const { event, sub: next } = decide(sub, s.pm25, s.observedAt, now);
      if (event) {
        const res = await send(env, sub.chatId, alertText(event, s, areaFor(sub), sub.profile));
        if (res.status === 403) {
          await env.HAZENOW_KV.delete(k.name); // user blocked the bot
          continue;
        }
      }
      if (JSON.stringify(next) !== JSON.stringify(sub)) await env.HAZENOW_KV.put(k.name, JSON.stringify(next));
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}

// ------------------------------------------------------------------ commands
const REGION_ALIASES: Record<string, string> = { c: "central", n: "north", s: "south", e: "east", w: "west", all: "island", sg: "island" };
function parseRegion(arg: string | undefined): string | null {
  if (!arg) return "central";
  const a = arg.toLowerCase().trim();
  const r = REGION_ALIASES[a] ?? a;
  return (REGIONS as readonly string[]).includes(r) || r === "island" ? r : null;
}
async function getProfile(env: Env, chatId: number): Promise<Profile> {
  const p = await env.HAZENOW_KV.get(profKey(chatId));
  return p && (PROFILES as string[]).includes(p) ? (p as Profile) : "general";
}

async function subscribe(env: Env, chatId: number, target: { region?: string; loc?: LatLon }, elevatedOptIn: boolean): Promise<string> {
  const existing = await env.HAZENOW_KV.get<Sub>(subKey(chatId), "json");
  const profile = await getProfile(env, chatId);
  const s = buildSnapshot(await getRaw(env), target.region ?? "central", target.loc);
  const sub: Sub = {
    chatId,
    region: target.region,
    loc: target.loc,
    profile,
    elevatedOptIn,
    band: s.band,
    lastObservedAt: s.observedAt,
    alerted: false,
    quiet: existing?.quiet ?? [22, 7],
    sentCount: 0,
  };
  await env.HAZENOW_KV.put(subKey(chatId), JSON.stringify(sub));
  const from = alertThreshold(sub) === "elevated" ? "Elevated" : "High";
  return [
    `🔔 <b>Alerts on ${esc(areaFor(sub))}.</b> Now: ${BANDS[s.band].glyph} ${BANDS[s.band].label} (PM2.5 ${s.pm25}).`,
    `We'll only message when the band changes to ${from} or above, and tell you when it's clear again. At most 3 a day. Never at night (${sub.quiet[0]}:00–${sub.quiet[1]}:00); you get a morning update instead.`,
    from === "High" && !target.loc ? `Want Elevated too? Send <code>/alert ${esc(target.region ?? "central")} all</code>.` : "",
    target.loc ? "<i>We keep this spot only to send your alerts. /stop deletes it.</i>" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function handleMessage(env: Env, m: TgMessage): Promise<void> {
  const chatId = m.chat.id;
  if (m.location) {
    const loc = { lat: m.location.latitude, lon: m.location.longitude };
    const profile = await getProfile(env, chatId);
    const s = buildSnapshot(await getRaw(env), "central", loc);
    await send(env, chatId, formatNow(s, "Your spot", profile), {
      reply_markup: {
        inline_keyboard: [[{ text: "🔔 Alert me for this spot", callback_data: `a:${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}` }]],
      },
    });
    return;
  }
  const text = (m.text ?? "").trim();
  if (!text.startsWith("/")) return;
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.split("@")[0].toLowerCase();
  switch (cmd) {
    case "/start":
    case "/help":
      await send(env, chatId, HELP, m.chat.type === "private" ? LOCATION_KEYBOARD : {});
      return;
    case "/now": {
      const region = parseRegion(args[0]);
      if (!region) return void (await send(env, chatId, "Areas: central, north, south, east, west, island."));
      const s = buildSnapshot(await getRaw(env), region);
      await send(env, chatId, formatNow(s, region === "island" ? "Islandwide" : title(region), await getProfile(env, chatId)));
      return;
    }
    case "/regions":
      await send(env, chatId, formatRegions(await getRaw(env)));
      return;
    case "/profile": {
      const p = (args[0] ?? "").toLowerCase() as Profile;
      if (!PROFILES.includes(p)) {
        const cur = await getProfile(env, chatId);
        await send(
          env,
          chatId,
          `<b>Who are you checking for?</b> Now: ${esc(FOR_LABEL[cur])}.\n${PROFILES.map((x) => `<code>/profile ${x}</code>`).join(" · ")}\n<i>Saved for this chat only.</i>`,
        );
        return;
      }
      await env.HAZENOW_KV.put(profKey(chatId), p);
      const sub = await env.HAZENOW_KV.get<Sub>(subKey(chatId), "json");
      if (sub) await env.HAZENOW_KV.put(subKey(chatId), JSON.stringify({ ...sub, profile: p }));
      await send(env, chatId, `Saved: ${esc(FOR_LABEL[p])}.`);
      return;
    }
    case "/alert": {
      const all = args.map((a) => a.toLowerCase()).includes("all");
      const region = parseRegion(args.find((a) => a.toLowerCase() !== "all"));
      if (!region) {
        await send(env, chatId, "Send <code>/alert west</code> (or central, north, south, east, island), or share a location and tap “Alert me for this spot”.");
        return;
      }
      await send(env, chatId, await subscribe(env, chatId, { region }, all));
      return;
    }
    case "/quiet": {
      const mm = (args[0] ?? "").match(/^(\d{1,2})-(\d{1,2})$/);
      const sub = await env.HAZENOW_KV.get<Sub>(subKey(chatId), "json");
      if (!sub) return void (await send(env, chatId, "Set an /alert first."));
      if (args[0] === "off") sub.quiet = [0, 0];
      else if (mm && +mm[1] < 24 && +mm[2] < 24) sub.quiet = [+mm[1], +mm[2]];
      else return void (await send(env, chatId, "Send <code>/quiet 22-7</code> (Singapore time) or <code>/quiet off</code>."));
      await env.HAZENOW_KV.put(subKey(chatId), JSON.stringify(sub));
      await send(env, chatId, sub.quiet[0] === sub.quiet[1] ? "Quiet hours off." : `Quiet hours ${sub.quiet[0]}:00–${sub.quiet[1]}:00.`);
      return;
    }
    case "/stop":
      await env.HAZENOW_KV.delete(subKey(chatId));
      await send(env, chatId, "Alerts off, and any saved spot is deleted. /alert turns them back on.");
      return;
    default:
      await send(env, chatId, HELP);
  }
}

async function handleUpdate(env: Env, u: TgUpdate): Promise<void> {
  if (u.message) return handleMessage(env, u.message);
  const cq = u.callback_query;
  if (cq?.data?.startsWith("a:") && cq.message) {
    const [lat, lon] = cq.data.slice(2).split(",").map(Number);
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      await send(env, cq.message.chat.id, await subscribe(env, cq.message.chat.id, { loc: { lat, lon } }, false));
    }
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/webhook") {
      if (req.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const update = (await req.json()) as TgUpdate;
      ctx.waitUntil(
        handleUpdate(env, update).catch(async (e) => {
          console.error("update failed", e);
          const chatId = update.message?.chat.id;
          if (chatId) await send(env, chatId, "Can't reach NEA's data right now. We'll try again in a few minutes.");
        }),
      );
      return new Response("ok");
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("HazeNow Telegram bot. Data: NEA via data.gov.sg", { status: 200 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(checkAlerts(env));
  },
} satisfies ExportedHandler<Env>;
