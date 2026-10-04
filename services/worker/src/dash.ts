/**
 * GET /dash: the private metrics dashboard. A static page (no data in it): it asks for the STATS_TOKEN once, keeps
 * it in sessionStorage (gone when the tab closes), and reads GET /v1/stats with it. noindex, no external scripts,
 * charts are inline SVG. Fonts come from the public site (Apfel Grotezk, OFL).
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
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>HazeNow metrics</title>
<style>
@font-face{font-family:"Apfel Grotezk";src:url(https://hazenow.pages.dev/fonts/apfel-grotezk-regular.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Apfel Grotezk";src:url(https://hazenow.pages.dev/fonts/apfel-grotezk-mittel.woff2) format("woff2");font-weight:500;font-display:swap}
:root{--ink:#14232b;--paper:#f3f1ec;--surface:#fbfaf7;--tint:#ebe7de;--muted:#4a5a62;--line:rgba(20,35,43,.12);--bar:#14232b;--bar2:#9fb3bb;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--ink:#f5f0e6;--paper:#101d23;--surface:#1a2d36;--tint:#14232b;--muted:#b1c1c7;--line:rgba(245,240,230,.14);--bar:#f5f0e6;--bar2:#5d7682;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 15px/1.45 "Apfel Grotezk",ui-sans-serif,system-ui,-apple-system,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 64px}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px 20px;margin-bottom:20px}
h1{font-weight:500;font-size:26px;margin:0;letter-spacing:-.01em}
h2{font-weight:500;font-size:17px;margin:0 0 4px}
h3{font-weight:500;font-size:14px;margin:14px 0 6px;color:var(--muted)}
.sub{color:var(--muted);font-size:13px;margin:0 0 12px}
.ctl{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
button,input{font:inherit;color:inherit}
button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 14px;cursor:pointer;min-height:34px}
button[aria-pressed=true]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px 18px;min-width:0}
.wide{grid-column:1/-1}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:14px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px}
.tile b{display:block;font-weight:500;font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.tile span{font-size:13px;color:var(--muted)}
.funnel{display:grid;gap:6px}
.fs{display:grid;grid-template-columns:170px 1fr 64px 60px;align-items:center;gap:10px;font-size:14px}
.fs .track{height:18px;background:var(--tint);border-radius:4px;overflow:hidden}
.fs .fill{height:100%;background:var(--bar);border-radius:0 4px 4px 0}
.fs .n{text-align:right;font-variant-numeric:tabular-nums;font-weight:500}
.fs .r{text-align:right;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.hb{display:grid;grid-template-columns:minmax(80px,140px) 1fr 52px;align-items:center;gap:8px;font-size:13px;margin:3px 0}
.hb .track{height:12px;border-radius:3px;background:var(--tint);overflow:hidden}
.hb .fill{height:100%;background:var(--bar);border-radius:0 3px 3px 0}
.hb .n{text-align:right;font-variant-numeric:tabular-nums}
svg.bars{width:100%;height:96px;display:block}
svg.bars rect.b{fill:var(--bar)} svg.bars rect.b2{fill:var(--bar2)} svg.bars rect.hit{fill:transparent}
svg.bars rect.hit:hover + rect, svg.bars g:hover rect.b{opacity:.75}
svg.bars line{stroke:var(--line)}
.axis{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin:2px 0 6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.note{font-size:13px;color:var(--muted)}
.empty{font-size:13px;color:var(--muted);font-style:italic}
a{color:inherit;text-underline-offset:3px}
form.login{max-width:420px;margin:12vh auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px}
form.login input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--paper);margin:10px 0}
dl.defs{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:13px;margin:0}
dl.defs dt{font-weight:500} dl.defs dd{margin:0;color:var(--muted)}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--paper);font-size:12px;padding:4px 8px;border-radius:6px;display:none;z-index:9;white-space:nowrap}
@media (max-width:560px){.fs{grid-template-columns:110px 1fr 48px 44px;font-size:13px}}
</style>
</head>
<body>
<main id="app"><p class="note">Loading…</p></main>
<div id="tip" role="tooltip"></div>
<script>
(() => {
const KEY = "hazenow-stats-token";
const app = document.getElementById("app");
const tip = document.getElementById("tip");
let days = Number(sessionStorage.getItem("hazenow-dash-days")) || 30;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (n == null ? "–" : Number(n).toLocaleString("en"));
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const token = () => { try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; } };

function login(msg) {
  app.innerHTML = '<form class="login"><h1>HazeNow metrics</h1><p class="sub">' + esc(msg || "Paste the stats token (~/.config/hazenow/stats-token.txt). It stays in this tab only.") + '</p><input type="password" name="t" autocomplete="off" aria-label="Stats token" required><button type="submit">Open</button></form>';
  app.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    try { sessionStorage.setItem(KEY, e.target.t.value.trim()); } catch {}
    load();
  });
  app.querySelector("input").focus();
}

function dayList(from, to) {
  const out = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Daily bars (one or two stacked series). series: [{label, days:{day:n}, cls}] */
function bars(series, list) {
  const W = 600, H = 96, n = list.length, gap = n > 60 ? 1 : 2, bw = (W - gap * (n - 1)) / n;
  const tot = list.map((d) => series.reduce((a, s) => a + ((s.days || {})[d] || 0), 0));
  const max = Math.max(1, ...tot);
  let g = "";
  list.forEach((d, i) => {
    const x = i * (bw + gap);
    let y = H;
    const parts = series.map((s) => s.label + " " + fmt((s.days || {})[d] || 0)).join(" · ");
    let rects = "";
    series.forEach((s, k) => {
      const v = (s.days || {})[d] || 0;
      if (!v) return;
      const h = Math.max(1.5, (v / max) * (H - 4));
      y -= h;
      rects += '<rect class="' + (s.cls || (k ? "b2" : "b")) + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (h - (k < series.length - 1 && series.length > 1 ? 0 : 0)).toFixed(1) + '" rx="' + Math.min(2, bw / 3).toFixed(1) + '"/>';
      if (series.length > 1) y -= 1;
    });
    g += '<g data-tip="' + esc(d + ": " + (series.length > 1 ? fmt(tot[i]) + " (" + parts + ")" : fmt(tot[i]))) + '">' + rects + '<rect class="hit" x="' + x.toFixed(1) + '" y="0" width="' + (bw + gap).toFixed(1) + '" height="' + H + '"/></g>';
  });
  const leg = series.length > 1 ? '<div class="legend">' + series.map((s, k) => '<span><i style="background:var(' + (k ? "--bar2" : "--bar") + ')"></i>' + esc(s.label) + "</span>").join("") + "</div>" : "";
  return leg + '<svg class="bars" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Daily counts, peak ' + fmt(max) + '"><line x1="0" x2="' + W + '" y1="' + (H - 0.5) + '" y2="' + (H - 0.5) + '"/>' + g + '</svg><div class="axis"><span>' + list[0].slice(5) + "</span><span>peak " + fmt(max) + "</span><span>" + list[n - 1].slice(5) + "</span></div>";
}

/** Horizontal bars for a breakdown {label: n}. */
function hbars(obj, names, limit) {
  const e = Object.entries(obj || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit || 12);
  if (!e.length) return '<p class="empty">Nothing yet.</p>';
  const max = e[0][1];
  return e.map(([k, v]) => '<div class="hb" data-tip="' + esc((names && names[k]) || k) + ": " + fmt(v) + '"><span>' + esc((names && names[k]) || k) + '</span><span class="track"><span class="fill" style="width:' + ((v / max) * 100).toFixed(1) + '%;display:block"></span></span><span class="n">' + fmt(v) + "</span></div>").join("");
}

function isoWeek(day) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // that week's Thursday decides the year
  const y = d.getUTCFullYear();
  return y + "-W" + String(1 + Math.floor((d - Date.UTC(y, 0, 1)) / 864e5 / 7)).padStart(2, "0");
}

const tile = (n, label, t) => '<div class="tile"' + (t ? ' title="' + esc(t) + '"' : "") + "><b>" + n + "</b><span>" + esc(label) + "</span></div>";
const card = (title, sub, body, wide) => '<section class="card' + (wide ? " wide" : "") + '"><h2>' + esc(title) + "</h2>" + (sub ? '<p class="sub">' + sub + "</p>" : "") + body + "</section>";

const SURFACE = { app: "Installed web app", browser: "Browser", android: "Android app", ios: "iOS app", mac: "Mac app" };
const VIA = { location: "Their location", typed: "Typed a search", list: "Picked from the list", saved: "A saved place", link: "A shared link", guess: "Our country guess" };

function render(s) {
  const E = s.events || {};
  const ev = (k) => E[k] || { total: 0, days: {}, a: {}, aDays: {}, b: {}, countries: {} };
  const list = dayList(s.from, s.to);
  const today = s.to;
  const open = ev("app_open"), week = ev("app_open_week"), eureka = ev("eureka"), shares = ev("share_sent");
  const dauToday = open.days[today] || 0;
  const dauAvg = Math.round(sum(open.days) / list.length * 10) / 10;
  const weeks = {};
  for (const [d, n] of Object.entries(week.days)) weeks[isoWeek(d)] = (weeks[isoWeek(d)] || 0) + n;
  const wauNow = weeks[isoWeek(today)] || 0;
  const landByDay = {}, landCards = {};
  for (const r of s.shareLandings || []) { landByDay[r.day] = r.total; for (const [k, v] of Object.entries(r.cards)) landCards[k] = (landCards[k] || 0) + v; }
  const reqByDay = {};
  for (const r of s.usage || []) reqByDay[r.day] = r.total;
  const f = s.funnel || { steps: [] };
  const top = Math.max(1, ...f.steps.map((x) => x.n || 0));
  const funnelHtml = '<div class="funnel">' + f.steps.map((x, i) => {
    const prev = i ? f.steps[i - 1].n : null;
    const w = x.n == null ? 0 : (x.n / top) * 100;
    return '<div class="fs"><span>' + esc(x.label) + '</span><span class="track">' + (x.n == null ? "" : '<span class="fill" style="display:block;width:' + w.toFixed(1) + '%"></span>') + '</span><span class="n">' + (x.n == null ? '<a href="' + esc(s.visits.enableUrl || "#") + '" title="' + esc(s.visits.reason || "") + '">enable</a>' : fmt(x.n)) + '</span><span class="r">' + (i && prev ? pct(x.n || 0, prev) : "") + "</span></div>";
  }).join("") + "</div>";
  const gh = s.github || {};
  const latest = gh.latest;
  const dlDays = {};
  for (const r of gh.daily || []) if (r.newDownloads) dlDays[r.day] = sum(r.newDownloads);
  const ghState = gh.state ? (gh.state.lastError ? "Last run failed: " + esc(gh.state.lastError) : "Archived " + esc(gh.state.lastOkAt || "")) : "Not archived yet (needs the GITHUB_TOKEN secret).";
  const visits = s.visits && s.visits.available
    ? Object.entries(s.visits.hosts).map(([h, v]) => "<h3>" + esc(h) + " · " + fmt(v.visits) + "</h3>" + bars([{ label: "Visits", days: v.days }], list)).join("")
    : '<p class="note">Not readable: ' + esc((s.visits && s.visits.reason) || "") + '. <a href="' + esc((s.visits && s.visits.enableUrl) || "#") + '">Open Web Analytics in Cloudflare</a>. To show visits here, add a Worker secret CF_ANALYTICS_TOKEN (Account Analytics: Read).</p>';
  const defs = Object.entries(s.eventInfo || {}).map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v.means) + (v.dims.length ? " · by " + esc(v.dims.join(", ")) : "") + (v.country ? " · country" : "") + "</dd>").join("");

  app.innerHTML =
    '<header><h1>HazeNow metrics</h1><span class="note">' + esc(s.from) + " to " + esc(s.to) + ' (UTC) · counts only, never who</span><div class="ctl">' +
    [7, 30, 90].map((d) => '<button data-days="' + d + '" aria-pressed="' + (d === days) + '">' + d + " days</button>").join("") +
    '<button data-act="gh" title="Fetch a GitHub snapshot now">Refresh GitHub</button><button data-act="out">Sign out</button></div></header>' +
    '<div class="tiles">' +
    tile(fmt(dauToday), "Active devices today", "app_open today (one per device per UTC day)") +
    tile(fmt(dauAvg), "Daily average (" + days + "d)", "Mean app_open per day over the window") +
    tile(fmt(wauNow), "Active devices this week", "app_open_week this ISO week (web app only)") +
    tile(pct(open.b.new || 0, (open.b.new || 0) + (open.b.returning || 0)), "New device-days", "app_open seen=new ÷ all app_open") +
    tile(pct(open.a.app || 0, (open.a.app || 0) + (open.a.browser || 0)), "Web opens from the installed app", "app_open surface=app ÷ (app + browser)") +
    tile(f.sharesPerEureka == null ? "–" : f.sharesPerEureka, "Shares per first verdict", "share_sent ÷ eureka") +
    tile(f.landingsPerShare == null ? "–" : f.landingsPerShare, "Landings per share", "share landings ÷ share_sent") +
    tile(latest ? fmt(latest.stars) : "–", "GitHub stars", latest ? "forks " + latest.forks + ", watchers " + latest.watchers : "") +
    "</div>" +
    '<div class="grid">' +
    card("Funnel", "Totals for the window. The right column is each step ÷ the step above it (steps come from different people, so read them as ratios, not conversion).", funnelHtml, true) +
    card("Daily active devices", "app_open per UTC day, installed web app vs browser vs native apps.", bars([{ label: "Web", days: Object.fromEntries(list.map((d) => [d, ((open.aDays.app || {})[d] || 0) + ((open.aDays.browser || {})[d] || 0)])) }, { label: "Native apps", days: Object.fromEntries(list.map((d) => [d, ((open.aDays.android || {})[d] || 0) + ((open.aDays.ios || {})[d] || 0) + ((open.aDays.mac || {})[d] || 0)])) }], list)) +
    card("Weekly active devices", "app_open_week per ISO week (web app).", hbars(weeks, null, 14)) +
    card("App opens by surface", "", hbars(open.a, SURFACE) + "<h3>New vs returning</h3>" + hbars(open.b)) +
    card("Countries", "App opens by country (Cloudflare's country for the web; the chosen place's country for native apps).", hbars(open.countries, null, 12)) +
    card("First verdicts (eureka)", "How the place was found, the first time a device saw a verdict.", bars([{ label: "First verdicts", days: eureka.days }], list) + hbars(eureka.a, VIA)) +
    card("Places picked", "place_set by method.", hbars(ev("place_set").a, VIA)) +
    card("Shares sent", "By card, and how.", bars([{ label: "Shares", days: shares.days }], list) + "<h3>Card</h3>" + hbars(shares.a) + "<h3>How</h3>" + hbars(shares.b)) +
    card("Share landings", "Opens of a share link (?s=card), by card.", bars([{ label: "Landings", days: landByDay }], list) + hbars(landCards)) +
    card("Installs and alerts", "", tile(fmt(ev("installed").total), "Installs (first launch from the Home Screen)") + "<h3>By OS</h3>" + hbars(ev("installed").a) + "<h3>Install hints shown</h3>" + hbars(ev("install_prompt_shown").a, { coach: "iPhone coach mark", inapp: "In-app browser strip" }) + "<h3>Alerts</h3>" + hbars({ on: ev("alerts_on").total, off: ev("alerts_off").total }) + '<p class="note">The push subscription table is the real count of alerts in use.</p>') +
    card("Downloads", "Cumulative per platform from GitHub release snapshots" + (latest ? " (" + esc(latest.day) + ")" : "") + "; bars are new downloads per day.", (latest ? hbars(latest.downloadsByPlatform) : '<p class="empty">No snapshot yet.</p>') + "<h3>New downloads per day</h3>" + bars([{ label: "Downloads", days: dlDays }], list) + "<h3>Download clicks on the site</h3>" + hbars(ev("download_click").a) + "<h3>Scriptable widget file served</h3>" + tile(fmt(ev("scriptable_file").total), "/widget/HazeNow.scriptable") + "<h3>QR codes shown (desktop)</h3>" + tile(fmt(ev("qr_shown").total), "qr_shown")) +
    card("GitHub", ghState, "<h3>Repo views per day · " + fmt(gh.totals && gh.totals.views) + "</h3>" + bars([{ label: "Views", days: Object.fromEntries((gh.traffic || []).map((r) => [r.day, r.views])) }], list) + "<h3>Clones per day · " + fmt(gh.totals && gh.totals.clones) + "</h3>" + bars([{ label: "Clones", days: Object.fromEntries((gh.traffic || []).map((r) => [r.day, r.clones])) }], list) + "<h3>Top referrers (GitHub's last 14 days)</h3>" + hbars(Object.fromEntries(((latest && latest.referrers) || []).map((r) => [r.referrer, r.count])))) +
    card("Site visits", "Cloudflare Web Analytics (cookieless).", visits) +
    card("Data server requests", "/v1/* requests per day · " + fmt(s.totals && s.totals.requests), bars([{ label: "Requests", days: reqByDay }], list)) +
    card("What each counter means", "Every number is a +1 on a (day, event, small label) counter. No IDs, IPs, user agents or coordinates exist anywhere. See docs/PRIVACY.md.", '<dl class="defs">' + defs + "</dl>", true) +
    "</div>";
}

async function load(refresh) {
  const t = token();
  if (!t) return login();
  app.setAttribute("aria-busy", "true");
  try {
    const r = await fetch("/v1/stats?days=" + days + (refresh ? "&refresh=github" : ""), { headers: { authorization: "Bearer " + t }, cache: "no-store" });
    if (r.status === 401 || r.status === 404) { try { sessionStorage.removeItem(KEY); } catch {} return login("That token didn't work. Try again."); }
    if (!r.ok) throw new Error("HTTP " + r.status);
    render(await r.json());
  } catch (e) {
    app.innerHTML = '<p class="note">Couldn\\'t load the numbers (' + esc(e.message) + '). <button data-act="retry">Retry</button></p>';
  } finally {
    app.removeAttribute("aria-busy");
  }
}

app.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.days) { days = Number(b.dataset.days); try { sessionStorage.setItem("hazenow-dash-days", String(days)); } catch {} load(); }
  else if (b.dataset.act === "gh") load(true);
  else if (b.dataset.act === "retry") load();
  else if (b.dataset.act === "out") { try { sessionStorage.removeItem(KEY); } catch {} login(); }
});
app.addEventListener("mousemove", (e) => {
  const g = e.target.closest && e.target.closest("[data-tip]");
  if (!g) { tip.style.display = "none"; return; }
  tip.textContent = g.dataset.tip;
  tip.style.display = "block";
  tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 12) + "px";
  tip.style.top = e.clientY + 14 + "px";
});
app.addEventListener("mouseleave", () => (tip.style.display = "none"));
load();
})();
</script>
</body>
</html>`;
