/**
 * GET /dash: the private metrics dashboard. A static page (no data in it): it asks for the STATS_TOKEN (the PIN) once,
 * keeps it in sessionStorage (gone when the tab closes), and reads GET /v1/stats with it. noindex, no external scripts,
 * charts are inline SVG. Fonts come from the public site (Apfel Grotezk, OFL).
 *
 * Built to answer three questions in five seconds on a phone: is anyone using it, is it growing, is it spreading.
 * One hero number (people this week) with a trend sentence and a calm status line, a progress bar to the next
 * milestone, four tiles with a change vs the previous period, the journey as one sentence, the share loop in one
 * line and downloads by platform. Everything else sits in a closed "More detail".
 *
 * The chosen window (7/30/90 days) is compared with the period of the same length before it, so the page asks
 * /v1/stats for twice the window (and at least 8 weeks, for the weekly trend) and splits the days itself.
 */
import type { Res } from "./routes.js";

export function dashPage(): Res {
  return {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src https://hazenow.pages.dev; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
    body: HTML,
  };
}

const HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#f3f1ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101d23" media="(prefers-color-scheme: dark)">
<title>HazeNow numbers</title>
<style>
@font-face{font-family:"Apfel Grotezk";src:url(https://hazenow.pages.dev/fonts/apfel-grotezk-regular.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Apfel Grotezk";src:url(https://hazenow.pages.dev/fonts/apfel-grotezk-mittel.woff2) format("woff2");font-weight:500;font-display:swap}
:root{--paper:#f3f1ec;--ink:#14232b;--mist:#9fb3bb;--soft:#5b6f78;--tint:#e8e4db;--up:#2e9e5b;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#101d23;--ink:#f3f1ec;--mist:#9fb3bb;--soft:#9fb3bb;--tint:#1b2d35;--up:#4cc07a;color-scheme:dark}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.45 "Apfel Grotezk",ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:720px;margin:0 auto;padding:20px 20px 48px;padding-top:max(20px,env(safe-area-inset-top))}
b,strong{font-weight:500}
.num{font-variant-numeric:tabular-nums}
button,input{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0;padding:0}
a{color:inherit;text-underline-offset:3px}
.soft{color:var(--soft)}
.up{color:var(--up)}

/* top bar */
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:40px}
.brand{font-weight:500;font-size:15px;letter-spacing:-.005em}
.seg{display:flex;gap:2px;background:var(--tint);border-radius:999px;padding:3px}
.seg button{font-size:13px;padding:6px 11px;border-radius:999px;color:var(--soft);min-height:32px;font-variant-numeric:tabular-nums}
.seg button[aria-pressed=true]{background:var(--paper);color:var(--ink);font-weight:500}

/* hero */
.eyebrow{font-size:14px;color:var(--soft);margin:0 0 6px}
.hero{font-weight:500;font-size:clamp(88px,30vw,136px);line-height:.9;letter-spacing:-.045em;margin:0 0 14px;font-variant-numeric:tabular-nums}
.trend{font-size:18px;margin:0 0 4px}
.status{font-size:16px;color:var(--soft);margin:0}
.goal{margin:28px 0 0}
.goal .bar{height:6px;border-radius:999px;background:var(--tint);overflow:hidden}
.goal .bar i{display:block;height:100%;background:var(--ink);border-radius:999px;min-width:6px}
.goal p{font-size:14px;color:var(--soft);margin:8px 0 0}
.goal p b{color:var(--ink)}
.goal .gname{font-size:17px;color:var(--ink);margin:0 0 10px}
.goal .gname span{color:var(--soft)}
.goal .unl{margin-top:4px}
.ladder{display:flex;gap:6px;margin:14px 0 0;padding:0;list-style:none;font-size:13px;color:var(--soft);font-variant-numeric:tabular-nums}
.ladder li{flex:1;border-top:2px solid var(--tint);padding-top:6px}
.ladder li.done{border-color:var(--up);color:var(--ink)}
.ladder li.now{border-color:var(--ink);color:var(--ink);font-weight:500}
.ladder li{position:relative}
.ladder button{all:unset;cursor:pointer;display:block;width:100%}
.ladder button:focus-visible{outline:2px solid var(--ink);outline-offset:3px;border-radius:2px}
.ladder .gtip{display:none;position:absolute;z-index:3;top:calc(100% + 8px);left:0;width:220px;padding:10px 12px;border-radius:10px;background:var(--ink);color:var(--paper);font-size:13px;line-height:1.4;font-weight:400;box-shadow:0 6px 20px rgba(0,0,0,.2)}
.ladder li:nth-child(n+3) .gtip{left:auto;right:0}
.ladder .gtip b{display:block;font-size:15px;font-weight:500;margin-bottom:4px}
.ladder .gtip span{display:block;opacity:.75}
.ladder .gtip em{display:block;font-style:normal;margin-top:6px}
@media (hover:hover){.ladder li:hover .gtip{display:block}}
.ladder li:has(button:focus-visible) .gtip,.ladder li.open .gtip{display:block}

/* sections */
section{margin-top:56px}
h2{font-size:14px;font-weight:400;color:var(--soft);margin:0 0 14px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:28px 20px}
@media (min-width:640px){.tiles{grid-template-columns:repeat(4,1fr)}}
.tile .v{display:block;font-weight:500;font-size:44px;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tile .l{display:block;font-size:15px;margin-top:8px}
.tile .d{display:block;font-size:13px;color:var(--soft);margin-top:3px;font-variant-numeric:tabular-nums}
.tile .d.up{color:var(--up)}
.tile{position:relative}
.tile .i{display:inline-flex;align-items:center;justify-content:center;margin-left:6px;width:16px;height:16px;border-radius:50%;border:1px solid var(--soft);background:none;color:var(--soft);font:500 10px/1 inherit;font-style:normal;cursor:pointer;vertical-align:2px;padding:0}
.tile .i[aria-expanded="true"]{border-color:currentColor;color:inherit}
.tile:nth-child(2n) .tip{left:auto;right:0}
.tile .tip{position:absolute;z-index:2;left:0;top:calc(100% + 6px);margin:0;padding:8px 10px;border-radius:8px;background:var(--ink);color:var(--paper);font-size:13px;line-height:1.35;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.18)}
.line{font-size:22px;line-height:1.35;letter-spacing:-.01em;margin:0;font-variant-numeric:tabular-nums}
.line .ar{color:var(--mist);padding:0 .15em}
.line .weak{text-decoration:underline;text-decoration-color:var(--mist);text-decoration-thickness:2px;text-underline-offset:6px}
.hint{font-size:15px;color:var(--soft);margin:12px 0 0}
.empty{font-size:16px;color:var(--soft);margin:0}

/* more detail */
details{margin-top:64px;border-top:1px solid var(--tint)}
summary{list-style:none;cursor:pointer;padding:18px 0;font-size:15px;color:var(--soft);display:flex;justify-content:space-between;align-items:center}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font-size:20px;line-height:1;color:var(--mist)}
details[open] summary::after{content:"\\2212"}
.more{display:grid;gap:40px;padding:8px 0 16px}
.more h3{font-size:15px;font-weight:500;margin:0 0 4px}
.more .sub{font-size:13px;color:var(--soft);margin:0 0 12px}
.rows{display:grid;gap:8px}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;font-size:15px;align-items:baseline}
.row .n{font-variant-numeric:tabular-nums;font-weight:500}
.row .t{grid-column:1/-1;height:3px;border-radius:999px;background:var(--tint);overflow:hidden}
.row .t i{display:block;height:100%;background:var(--mist)}
svg.bars{width:100%;height:72px;display:block}
svg.bars rect{fill:var(--ink)}
svg.bars line{stroke:var(--tint)}
.axis{display:flex;justify-content:space-between;font-size:12px;color:var(--soft);margin-top:4px;font-variant-numeric:tabular-nums}
.pair{display:grid;gap:40px}
@media (min-width:640px){.pair{grid-template-columns:1fr 1fr}}
dl.defs{display:grid;gap:12px;margin:0;font-size:14px}
dl.defs dt{font-weight:500}
dl.defs dd{margin:2px 0 0;color:var(--soft)}
.btn{border:1px solid var(--mist);border-radius:999px;padding:8px 16px;font-size:14px;min-height:40px}
footer{margin-top:40px;font-size:13px;color:var(--soft);display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 16px}
footer button{color:var(--soft);text-decoration:underline;text-underline-offset:3px;font-size:13px}

/* login */
form.login{max-width:340px;margin:22vh auto 0;text-align:left}
form.login h1{font-weight:500;font-size:32px;letter-spacing:-.02em;margin:6px 0 8px}
form.login p{color:var(--soft);margin:0 0 28px;font-size:15px}
form.login input{width:100%;padding:14px 16px;border-radius:14px;border:1px solid var(--tint);background:var(--tint);font-size:22px;letter-spacing:.3em;text-align:center;outline:none}
form.login input:focus{border-color:var(--mist)}
form.login button{width:100%;margin-top:12px;padding:14px;border-radius:14px;background:var(--ink);color:var(--paper);font-weight:500;font-size:16px}
.err{color:var(--ink)!important}
.loading{color:var(--soft);margin-top:30vh;text-align:center}
</style>
</head>
<body>
<main id="app"><p class="loading">Loading…</p></main>
<script>
(() => {
const KEY = "hazenow-stats-token";
const DKEY = "hazenow-dash-days";
const app = document.getElementById("app");
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} }, del: (k) => { try { sessionStorage.removeItem(k); } catch {} } };
let days = [7, 30, 90].includes(Number(ss.get(DKEY))) ? Number(ss.get(DKEY)) : 7;
let last = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("en"));
const sumObj = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
/** The n days ending \`back\` days before \`to\` (back 0 = ending today). */
const span = (to, n, back) => { const end = Date.parse(to + "T00:00:00Z") - back * DAY, out = []; for (let i = n - 1; i >= 0; i--) out.push(iso(end - i * DAY)); return out; };
const over = (byDay, list) => list.reduce((a, d) => a + ((byDay || {})[d] || 0), 0);
const shortDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const PERIOD = { 7: "last week", 30: "the prior 30", 90: "the prior 90" };
const THIS = { 7: "this week", 30: "in 30 days", 90: "in 90 days" };
/** Real goals (weekly people), each with what it proves and what it unlocks. Progress uses the best week so far. */
const GOALS = [
  { n: 25, name: "Strangers, not just friends", unlocks: "Send the agency permission emails; publish the build story", by: "by 30 Nov 2026" },
  { n: 100, name: "A real community", unlocks: "Start the WhatsApp channel; go big for Thai burning season", by: "by Mar 2027" },
  { n: 1000, name: "A public tool", unlocks: "Pitch press, NEA and the data.gov.sg showcase; the iPhone app is worth US$99", by: "by SG haze season 2027" },
  { n: 10000, name: "How Southeast Asia checks the haze", unlocks: "Free embeds for schools and employers; a Kairos case study with real numbers", by: "during a major haze episode" },
];
const CARD = { now: "Air right now", clocks: "Two clocks", group: "Group plan", clear: "All clear" };
const PLATFORM = { android: "Android", mac: "Mac", cli: "CLI", scriptable: "Scriptable", scriptable_js: "Scriptable (JS)", home_assistant: "Home Assistant", swiftbar: "SwiftBar", shell: "Shell", iphone_web: "iPhone web app", android_web: "Android web app", ios: "iPhone", other: "Other" };
const SURFACE = { app: "Home Screen web app", browser: "Browser", android: "Android app", ios: "iPhone app", mac: "Mac app" };
const VIA = { location: "Used their location", typed: "Typed a search", list: "Picked from the list", saved: "A saved place", link: "Opened a shared link", guess: "Our country guess" };
const HOW = { share: "Share sheet", download: "Saved the image", copy_text: "Copied the text", copy_link: "Copied the link" };
const HINT = { coach: "iPhone “Add to Home Screen” tip", inapp: "“Open in your browser” strip" };
const NAME = {
  app_open: "Daily opens", app_open_week: "Weekly opens", eureka: "Saw their air (first time)", place_set: "Picked a place",
  share_sent: "Shared a card", install_prompt_shown: "Install tip shown", installed: "Installed to Home Screen",
  alerts_on: "Turned alerts on", alerts_off: "Turned alerts off", download_click: "Download button clicked",
  qr_shown: "“Open on your phone” QR shown", scriptable_file: "Scriptable widget fetched",
};

/* ---------------------------------------------------------------- login */

function login(msg) {
  app.innerHTML = '<form class="login" autocomplete="off"><div class="soft">HazeNow</div><h1>Your numbers</h1><p class="' + (msg ? "err" : "") + '">' + esc(msg || "Enter your PIN. It stays in this tab only.") + '</p><input type="password" name="t" inputmode="numeric" autocomplete="off" aria-label="PIN" required><button type="submit">Open</button></form>';
  app.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); ss.set(KEY, e.target.t.value.trim()); load(); });
  app.querySelector("input").focus();
}

/* ---------------------------------------------------------------- pieces */

/** "▲ 4 vs last week" / "▼ 2 vs last week" / "Same as last week". Never red: a dip is just a calm ▼. */
function delta(cur, prev, vs, cls) {
  const d = cur - prev;
  if (!d) return '<span class="' + (cls || "") + '">Same as ' + esc(vs) + "</span>";
  return '<span class="' + (cls || "") + (d > 0 ? " up" : "") + '">' + (d > 0 ? "▲ " : "▼ ") + fmt(Math.abs(d)) + " vs " + esc(vs) + "</span>";
}

function tile(v, label, d, tip) {
  const t = tip ? '<button class="i" data-act="tip" aria-expanded="false" aria-label="What does ' + esc(label) + ' mean?">i</button>' : "";
  return '<div class="tile"><span class="v">' + v + '</span><span class="l">' + esc(label) + t + '</span><span class="d' + (d.up ? " up" : "") + '">' + d.html + "</span>" +
    (tip ? '<p class="tip" hidden>' + tip + "</p>" : "") + "</div>";
}
function tileDelta(cur, prev) {
  const d = cur - prev;
  if (!d) return { html: "Same as " + esc(PERIOD[days]) };
  return { up: d > 0, html: (d > 0 ? "▲ " : "▼ ") + fmt(Math.abs(d)) + " vs " + esc(PERIOD[days]) };
}

/** A quiet ranked list {key: n} with faint bars. */
function rows(obj, names, limit, emptyMsg) {
  const e = Object.entries(obj || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit || 10);
  if (!e.length) return '<p class="empty" style="font-size:14px">' + esc(emptyMsg || "Nothing yet.") + "</p>";
  const max = e[0][1];
  return '<div class="rows">' + e.map(([k, v]) => '<div class="row"><span>' + esc((names && names[k]) || k) + '</span><span class="n">' + fmt(v) + '</span><span class="t"><i style="width:' + ((v / max) * 100).toFixed(1) + '%"></i></span></div>').join("") + "</div>";
}

/** Daily bars for one series over \`list\`. */
function bars(byDay, list, label) {
  const W = 600, H = 72, n = list.length, gap = n > 60 ? 1 : n > 20 ? 2 : 6, bw = (W - gap * (n - 1)) / n;
  const vals = list.map((d) => (byDay || {})[d] || 0);
  const max = Math.max(...vals);
  if (!max) return '<p class="empty" style="font-size:14px">Nothing in this period yet.</p>';
  let g = "";
  vals.forEach((v, i) => {
    if (!v) return;
    const h = Math.max(2, (v / max) * (H - 2));
    g += '<rect x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(2, bw / 3).toFixed(1) + '"><title>' + esc(list[i] + ": " + fmt(v)) + "</title></rect>";
  });
  return '<svg class="bars" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label + ", most in a day " + fmt(max)) + '"><line x1="0" x2="' + W + '" y1="' + (H - 0.5) + '" y2="' + (H - 0.5) + '"/>' + g + '</svg><div class="axis"><span>' + shortDate(list[0]) + "</span><span>most in a day: " + fmt(max) + "</span><span>" + shortDate(list[n - 1]) + "</span></div>";
}

const block = (title, sub, body) => "<div><h3>" + esc(title) + "</h3>" + (sub ? '<p class="sub">' + sub + "</p>" : "") + body + "</div>";

/* ---------------------------------------------------------------- the numbers */

function compute(s) {
  const E = s.events || {};
  const ev = (k) => E[k] || { total: 0, days: {}, a: {}, aDays: {}, b: {}, countries: {} };
  const cur = span(s.to, days, 0), prev = span(s.to, days, days);
  const byA = (e, list) => Object.fromEntries(Object.entries(ev(e).aDays || {}).map(([k, d]) => [k, over(d, list)]));

  // People this week: web devices (once per device per ISO week) plus the busiest day of the native apps (they only
  // report daily). A device that opens on both sides of a Monday counts twice, so it's "about".
  const native = (d) => ["android", "ios", "mac"].reduce((a, k) => a + (((ev("app_open").aDays || {})[k] || {})[d] || 0), 0);
  const week = (back) => { const l = span(s.to, 7, back * 7); return over(ev("app_open_week").days, l) + Math.max(0, ...l.map(native)); };
  const weeks = Array.from({ length: 8 }, (_, i) => week(i)); // weeks[0] = the last 7 days

  const landDays = {}, landCardsCur = {};
  for (const r of s.shareLandings || []) { landDays[r.day] = r.total; if (cur.includes(r.day)) for (const [k, v] of Object.entries(r.cards)) landCardsCur[k] = (landCardsCur[k] || 0) + v; }
  const visitDays = {};
  if (s.visits && s.visits.available) for (const h of Object.values(s.visits.hosts)) for (const [d, v] of Object.entries(h.days)) visitDays[d] = (visitDays[d] || 0) + v;
  const gh = s.github || {};
  const dlDays = {};
  for (const r of gh.daily || []) if (r.newDownloads) dlDays[r.day] = sumObj(r.newDownloads);

  const P = (list) => {
    const installs = over(ev("installed").days, list), downloads = over(dlDays, list);
    return {
      newPeople: over(ev("eureka").days, list),
      installs, downloads, installed: installs + downloads,
      shared: over(ev("share_sent").days, list),
      alertsNet: over(ev("alerts_on").days, list) - over(ev("alerts_off").days, list),
      visits: s.visits && s.visits.available ? over(visitDays, list) : null,
      landings: over(landDays, list),
    };
  };
  return { ev, cur, prev, byA, weeks, now: P(cur), was: P(prev), landDays, landCardsCur, visitDays, dlDays, gh };
}

function statusLine(w) {
  let streak = 0;
  while (streak < w.length - 1 && w[streak] > w[streak + 1]) streak++;
  if (!w[0] && !w[1]) return "Quiet so far. One message to a friend changes that.";
  if (streak >= 2) return "Growing for " + streak + " weeks straight.";
  if (w[0] < 10) return "Early days: mostly you and testers so far.";
  if (w[0] > w[1]) return "Up on last week. Keep going.";
  if (w[0] < w[1]) return "A quieter week. Small numbers swing; the trend matters more.";
  return "Holding steady.";
}

function render(s) {
  last = s;
  const c = compute(s);
  const { now, was, weeks } = c;
  const w0 = weeks[0];

  // Hero and goal gradient
  const dw = w0 - weeks[1];
  const trend = !dw ? "Same as last week" : (dw > 0 ? '<span class="up">▲ ' + fmt(dw) + " more than last week</span>" : "▼ " + fmt(-dw) + " fewer than last week");
  const best = Math.max(...weeks);
  const goal = GOALS.find((g) => g.n > best) || GOALS[GOALS.length - 1];
  const pct = Math.min(100, (best / goal.n) * 100);

  // Tiles
  const subs = typeof s.alertsActive === "number";
  const ALERT_TIP = "Signed up for alerts right now";
  const alertsTile = subs
    ? tile(fmt(s.alertsActive), "Alerts on", now.alertsNet ? { up: now.alertsNet > 0, html: (now.alertsNet > 0 ? "▲ " : "▼ ") + fmt(Math.abs(now.alertsNet)) + " " + esc(THIS[days]) } : { html: "No change " + esc(THIS[days]) }, ALERT_TIP)
    : tile(fmt(now.alertsNet), "Alerts on (net)", tileDelta(now.alertsNet, was.alertsNet), ALERT_TIP);

  // Journey
  const steps = [
    { n: now.visits, word: "visited", gerund: "visitors" },
    { n: now.newPeople, word: "saw their air", gerund: "seeing their air" },
    { n: now.installed, word: "installed", gerund: "installing" },
    { n: now.shared, word: "shared", gerund: "sharing" },
  ].filter((x) => x.n != null);
  let weak = -1, worst = Infinity;
  for (let i = 1; i < steps.length; i++) if (steps[i - 1].n > 0) { const r = steps[i].n / steps[i - 1].n; if (r < worst) { worst = r; weak = i; } }
  const journeyEmpty = steps.every((x) => !x.n);
  const journey = journeyEmpty
    ? '<p class="empty">Nobody through the door ' + esc(THIS[days]) + " yet. The first visitor is the hardest.</p>"
    : '<p class="line">' + steps.map((x, i) => (i ? '<span class="ar">→</span>' : "") + '<span class="' + (i === weak || i === weak - 1 ? "weak" : "") + '"><b>' + fmt(x.n) + "</b> " + esc(x.word) + "</span>").join(" ") + "</p>" +
      (weak > 0 && worst < 1 ? '<p class="hint">Biggest drop: ' + esc(steps[weak - 1].gerund) + " → " + esc(steps[weak].gerund) + ". That’s the one to fix next.</p>" : "");

  // Spreading
  const topCard = Object.entries(c.landCardsCur).sort((a, b) => b[1] - a[1])[0];
  const topTxt = topCard ? " Top card: <b>" + esc(CARD[topCard[0]] || topCard[0]) + "</b> (" + fmt(topCard[1]) + ")." : "";
  let spread;
  if (now.shared && now.landings) spread = '<p class="line">Each share brings <b>~' + fmt(Math.round((now.landings / now.shared) * 10) / 10) + "</b> visits.</p>" + '<p class="hint">' + fmt(now.shared) + " shared → " + fmt(now.landings) + " opened a share link." + topTxt + "</p>";
  else if (now.landings) spread = '<p class="line"><b>' + fmt(now.landings) + "</b> visits came from share links.</p>" + (topTxt ? '<p class="hint">' + topTxt.trim() + "</p>" : "");
  else if (now.shared) spread = '<p class="line"><b>' + fmt(now.shared) + "</b> shared, nobody has opened one yet.</p>";
  else spread = '<p class="empty">No shares yet — the first one is the hardest.</p>';

  // Downloads
  const latest = c.gh.latest;
  const dl = latest ? Object.entries(latest.downloadsByPlatform || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
  const downloads = dl.length
    ? '<p class="line" style="font-size:19px">' + dl.map(([k, v]) => esc(PLATFORM[k] || k) + " <b>" + fmt(v) + "</b>").join('<span class="ar"> · </span>') + "</p>" + '<p class="hint">' + fmt(sumObj(latest.downloadsByPlatform)) + " in all, since the first release." + (now.downloads ? " " + fmt(now.downloads) + " new " + esc(THIS[days]) + "." : "") + "</p>"
    : '<p class="empty">No downloads counted yet.</p>';

  app.innerHTML =
    '<div class="top"><span class="brand">HazeNow</span><div class="seg" role="group" aria-label="Period">' +
    [7, 30, 90].map((d) => '<button data-days="' + d + '" aria-pressed="' + (d === days) + '">' + d + "d</button>").join("") + "</div></div>" +

    '<p class="eyebrow">People who checked their air this week</p>' +
    '<p class="hero">' + fmt(w0) + "</p>" +
    '<p class="trend">' + trend + "</p>" +
    '<p class="status">' + esc(statusLine(weeks)) + "</p>" +
    '<div class="goal"><p class="gname">Next goal: <b>' + fmt(goal.n) + ' people a week</b> <span>· ' + esc(goal.name) + "</span></p>" +
    '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + goal.n + '" aria-valuenow="' + best + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    "<p>Best week <b>" + fmt(best) + "</b> of " + fmt(goal.n) + " · aim " + esc(goal.by) + "</p>" +
    '<p class="unl">Unlocks: ' + esc(goal.unlocks) + "</p>" +
    '<ol class="ladder">' + GOALS.map((g) => {
      const done = best >= g.n;
      const status = done ? "Reached ✓" : g === goal ? fmt(g.n - best) + " more people a week to go" : "Comes after " + fmt(GOALS[GOALS.indexOf(g) - 1].n);
      return '<li class="' + (done ? "done" : g === goal ? "now" : "") + '"><button data-act="goal" aria-label="Goal ' + fmt(g.n) + '">' + (done ? "✓ " : "") + (g.n >= 1000 ? g.n / 1000 + "k" : g.n) + "</button>" +
        '<div class="gtip" role="tooltip"><b>' + fmt(g.n) + " a week · " + esc(g.name) + "</b><span>Unlocks: " + esc(g.unlocks) + "</span><span>Aim " + esc(g.by) + "</span><em>" + status + "</em></div></li>";
    }).join("") + "</ol></div>" +

    "<section><h2>" + (days === 7 ? "This week" : "Last " + days + " days") + ", vs " + esc(PERIOD[days]) + '</h2><div class="tiles">' +
    tile(fmt(now.newPeople), "New people", tileDelta(now.newPeople, was.newPeople), "First reading on a new device") +
    tile(fmt(now.installed), "Installed", tileDelta(now.installed, was.installed), fmt(now.installs) + " Home Screen · " + fmt(now.downloads) + " app downloads") +
    tile(fmt(now.shared), "Shared", tileDelta(now.shared, was.shared), "Cards sent or links copied") +
    alertsTile +
    "</div></section>" +

    "<section><h2>The journey</h2>" + journey + "</section>" +
    "<section><h2>Spreading</h2>" + spread + "</section>" +
    "<section><h2>Downloads by platform</h2>" + downloads + "</section>" +

    more(s, c) +

    '<footer><span>Counts devices, not people. Never who. See docs/PRIVACY.md.</span><span>' + esc(shortDate(c.cur[0])) + " – " + esc(shortDate(c.cur[c.cur.length - 1])) + ' (UTC) · <button data-act="out">Sign out</button></span></footer>';
}

function more(s, c) {
  const { ev, cur, byA, now, gh } = c;
  const latest = gh.latest;
  const nativeDays = {};
  for (const k of ["android", "ios", "mac"]) for (const [d, v] of Object.entries((ev("app_open").aDays || {})[k] || {})) nativeDays[d] = (nativeDays[d] || 0) + v;
  const opensDays = ev("app_open").days;
  const reqDays = {};
  for (const r of s.usage || []) reqDays[r.day] = r.total;
  const ghState = gh.state ? (gh.state.lastError ? "Last fetch failed: " + esc(gh.state.lastError) : "Last fetched " + esc(String(gh.state.lastOkAt || "").replace("T", " ").slice(0, 16)) + " UTC") : "Not fetched yet (needs the GITHUB_TOKEN secret).";
  const views = Object.fromEntries((gh.traffic || []).map((r) => [r.day, r.views]));
  const clones = Object.fromEntries((gh.traffic || []).map((r) => [r.day, r.clones]));
  const since = "Since " + esc(shortDate(s.from)) + ".";
  const visitsBlock = s.visits && s.visits.available
    ? bars(c.visitDays, cur, "Visits per day") + '<div class="rows" style="margin-top:14px">' + Object.entries(s.visits.hosts).map(([h, v]) => '<div class="row"><span>' + esc(h === "hazenow.pages.dev" ? "Website" : h === "hazenow-app.pages.dev" ? "Web app" : h) + '</span><span class="n">' + fmt(over(v.days, cur)) + "</span></div>").join("") + "</div>"
    : '<p class="empty" style="font-size:14px">Not connected: ' + esc((s.visits && s.visits.reason) || "") + '. <a href="' + esc((s.visits && s.visits.enableUrl) || "#") + '">Cloudflare Web Analytics</a>.</p>';
  const defs = Object.entries(s.eventInfo || {}).map(([k, v]) => "<div><dt>" + esc(NAME[k] || k) + "</dt><dd>" + esc(v.means) + ".</dd></div>").join("") +
    "<div><dt>People this week</dt><dd>Web devices that opened HazeNow in the last 7 days (counted once per device per calendar week), plus the busiest day of the Android, iPhone and Mac apps. Someone who opens it on both sides of a Monday counts twice, so read it as “about”.</dd></div>" +
    "<div><dt>Installed</dt><dd>First launches from the Home Screen plus new app downloads from GitHub releases.</dd></div>" +
    "<div><dt>Share-link visits</dt><dd>Opens of a link that came from a shared card.</dd></div>";

  return '<details><summary>More detail</summary><div class="more">' +
    '<div class="pair">' +
    block("People per day", "Opens, once per device per day.", bars(opensDays, cur, "Opens per day")) +
    block("Visits per day", "Website and web app (Cloudflare, no cookies).", visitsBlock) +
    "</div>" +
    '<div class="pair">' +
    block("Where they open it", "Browser, Home Screen or an app.", rows(byA("app_open", cur), SURFACE)) +
    block("Countries", since, rows(ev("app_open").countries, null, 10)) +
    "</div>" +
    '<div class="pair">' +
    block("How they found their place", "The first time they saw their air.", rows(byA("eureka", cur), VIA)) +
    block("Places picked", "Every time someone chose a place.", rows(byA("place_set", cur), VIA)) +
    "</div>" +
    '<div class="pair">' +
    block("Shares per day", "", bars(ev("share_sent").days, cur, "Shares per day")) +
    block("Share-link visits per day", "", bars(c.landDays, cur, "Share-link visits per day")) +
    "</div>" +
    '<div class="pair">' +
    block("Cards shared", "", rows(byA("share_sent", cur), CARD, 10, "No shares yet — the first one is the hardest.")) +
    block("Cards that brought visits", "", rows(c.landCardsCur, CARD)) +
    "</div>" +
    '<div class="pair">' +
    block("How they shared", since, rows(ev("share_sent").b, HOW)) +
    block("Alerts", "Turned on and off in this period.", rows({ "Turned on": over(ev("alerts_on").days, cur), "Turned off": over(ev("alerts_off").days, cur) }, null, 2, "No alert changes in this period.")) +
    "</div>" +
    '<div class="pair">' +
    block("Installs by phone", "First launch from the Home Screen.", rows(byA("installed", cur), PLATFORM)) +
    block("Install tips shown", "", rows(byA("install_prompt_shown", cur), HINT)) +
    "</div>" +
    '<div class="pair">' +
    block("Download buttons clicked", "On the site.", rows(byA("download_click", cur), PLATFORM)) +
    block("Other", "", rows({ "“Open on your phone” QR shown": over(ev("qr_shown").days, cur), "Scriptable widget fetched": over(ev("scriptable_file").days, cur), "App downloads (new)": now.downloads, "Native app opens": over(nativeDays, cur) }, null, 6, "Nothing in this period.")) +
    "</div>" +
    block("GitHub", ghState + (latest ? " · " + fmt(latest.stars) + " stars · " + fmt(latest.forks) + " forks" : ""),
      '<div class="pair"><div><p class="sub">Repo views per day</p>' + bars(views, cur, "Repo views per day") + '</div><div><p class="sub">Clones per day</p>' + bars(clones, cur, "Clones per day") + "</div></div>" +
      '<p class="sub" style="margin-top:20px">Where visitors came from (GitHub’s last 14 days)</p>' + rows(Object.fromEntries(((latest && latest.referrers) || []).map((r) => [r.referrer, r.count]))) +
      '<p style="margin:20px 0 0"><button class="btn" data-act="gh">Refresh GitHub</button></p>') +
    block("Data server requests", "Calls to the air-quality API per day.", bars(reqDays, cur, "Requests per day")) +
    block("What each number counts", "Every number is a +1 on a (day, event, small label) counter. No IDs, IPs, user agents or coordinates are kept anywhere.", '<dl class="defs">' + defs + "</dl>") +
    "</div></details>";
}

/* ---------------------------------------------------------------- load */

async function load(refresh) {
  const t = ss.get(KEY);
  if (!t) return login();
  app.setAttribute("aria-busy", "true");
  try {
    const want = Math.max(2 * days, 56);
    const r = await fetch("/v1/stats?days=" + want + (refresh ? "&refresh=github" : ""), { headers: { authorization: "Bearer " + t }, cache: "no-store" });
    if (r.status === 401 || r.status === 404) { ss.del(KEY); return login("That PIN didn’t work. Try again."); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const open = !!app.querySelector("details[open]");
    render(await r.json());
    if (open) app.querySelector("details").open = true;
  } catch (e) {
    app.innerHTML = '<p class="loading">Couldn’t load the numbers (' + esc(e.message) + '). <button class="btn" data-act="retry">Try again</button></p>';
  } finally {
    app.removeAttribute("aria-busy");
  }
}

app.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.dataset.act !== "goal") app.querySelectorAll(".ladder li.open").forEach((l) => l.classList.remove("open"));
  if (b && b.dataset.act === "goal") { const li = b.closest("li"); const was = li.classList.contains("open"); app.querySelectorAll(".ladder li.open").forEach((l) => l.classList.remove("open")); if (!was) li.classList.add("open"); return; }
  if (!b || b.dataset.act !== "tip") app.querySelectorAll(".tile .tip:not([hidden])").forEach((t) => { t.hidden = true; t.parentNode.querySelector(".i").setAttribute("aria-expanded", "false"); });
  if (!b) return;
  if (b.dataset.days) { days = Number(b.dataset.days); ss.set(DKEY, String(days)); if (last && last.days >= Math.max(2 * days, 56)) { const open = !!app.querySelector("details[open]"); render(last); if (open) app.querySelector("details").open = true; } else load(); }
  else if (b.dataset.act === "tip") { const tp = b.closest(".tile").querySelector(".tip"); const on = tp.hidden; app.querySelectorAll(".tile .tip").forEach((t) => { t.hidden = true; t.parentNode.querySelector(".i").setAttribute("aria-expanded", "false"); }); tp.hidden = !on; b.setAttribute("aria-expanded", String(on)); }
  else if (b.dataset.act === "gh") load(true);
  else if (b.dataset.act === "retry") load();
  else if (b.dataset.act === "out") { ss.del(KEY); last = null; login(); }
});
load();
})();
</script>
</body>
</html>`;
