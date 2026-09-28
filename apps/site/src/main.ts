/**
 * hazenow.pages.dev landing page: the live reading in the hero (reusing packages/core, so the maths and the words
 * match every HazeNow app), plus the "Copy script" button. No framework, no analytics, no cookies.
 */
import {
  SG_AREAS,
  bandAnchor,
  bandInfo,
  findArea,
  getSnapshot,
  officialPsiLabel,
  provenance,
  psiLabel,
  regionLabel,
  trendWords,
  uncertaintyLine,
  verdict,
  type LatLon,
  type Snapshot,
} from "hazenow";
import { initSea } from "./sea";

const APP_BASE = __APP_BASE__;
const STORE_KEY = "hazenow-site-place";
const REFRESH_MS = 5 * 60_000;

type Place = { kind: "island" } | { kind: "region"; region: string } | { kind: "area"; name: string; point: LatLon };

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/* ------------------------------------------------------------------ app-only links */

// Links meant for the web app (embeds, exact points, QA) that land on "/" go on to the app.
// Share-card links (?area= / ?region=, plus &s=<card>) stay here: this page is their landing. The hero shows
// that place's reading, and "Open HazeNow" carries the original params along.
{
  const q = new URLSearchParams(location.search);
  if (["embed", "lat", "lon", "mock", "theme"].some((k) => q.has(k))) location.replace(APP_BASE + location.search + location.hash);
}

/* ------------------------------------------------------------------ place */

function placeFromValue(v: string | null | undefined): Place | null {
  if (!v) return null;
  if (v === "island") return { kind: "island" };
  if (v.startsWith("r:")) return { kind: "region", region: v.slice(2) };
  if (v.startsWith("a:")) {
    const a = findArea(v.slice(2));
    return a ? { kind: "area", name: a.name, point: { lat: a.lat, lon: a.lon } } : null;
  }
  return null;
}
const placeValue = (p: Place) => (p.kind === "island" ? "island" : p.kind === "region" ? `r:${p.region}` : `a:${p.name}`);

const REGIONS = ["north", "south", "east", "west", "central"];

/**
 * A place from a share link. Cards link to `?area=<name or slug>` (web: "Jurong%20East", Android: "jurong-east")
 * or `?region=<name>` (share.ts / COPY §15). findArea normalises case and punctuation, so both forms resolve.
 */
function sharedPlace(q: URLSearchParams): Place | null {
  const region = q.get("region")?.trim().toLowerCase();
  if (region === "island" || region === "singapore") return { kind: "island" };
  if (region && REGIONS.includes(region)) return { kind: "region", region };
  const area = q.get("area")?.trim();
  if (area) {
    const a = findArea(area) ?? findArea(area.replace(/[-_+]+/g, " "));
    if (a) return { kind: "area", name: a.name, point: { lat: a.lat, lon: a.lon } };
  }
  return null;
}

/** "air in Tampines" / "air in the West" / "air in Central" / "air across Singapore" */
function airPhrase(p: Place): string {
  if (p.kind === "area") return `air in ${p.name}`;
  if (p.kind === "island") return "air across Singapore";
  return p.region === "central" ? "air in Central" : `air in the ${regionLabel(p.region)}`;
}

const params = new URLSearchParams(location.search);
const shared = sharedPlace(params);
/** The share link's own query (area/region/s), passed on untouched while the shared place is showing. */
const sharedQuery = shared ? location.search : "";

function initialPlace(): Place {
  if (shared) return shared;
  try {
    return placeFromValue(localStorage.getItem(STORE_KEY)) ?? { kind: "island" };
  } catch {
    return { kind: "island" };
  }
}

function appLink(p: Place): string {
  if (shared && p === shared) return APP_BASE + sharedQuery;
  if (p.kind === "island") return `${APP_BASE}?region=island`;
  if (p.kind === "region") return `${APP_BASE}?region=${encodeURIComponent(p.region)}`;
  return `${APP_BASE}?area=${encodeURIComponent(p.name)}`;
}

function cliFlags(p: Place): string {
  if (p.kind === "island") return " --region island";
  if (p.kind === "region") return ` --region ${p.region}`;
  return ` --area "${p.name}"`;
}

function buildSelect(sel: HTMLSelectElement, current: Place) {
  const regions = ["north", "south", "east", "west", "central"]
    .map((r) => `<option value="r:${r}">${regionLabel(r)} station</option>`)
    .join("");
  const areas = [...SG_AREAS]
    .map((a) => a.name)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="a:${esc(n)}">${esc(n)}</option>`)
    .join("");
  sel.innerHTML = `<option value="island">Singapore (island average)</option>
<optgroup label="NEA stations">${regions}</optgroup>
<optgroup label="Towns and planning areas">${areas}</optgroup>`;
  sel.value = placeValue(current);
  sel.disabled = false;
}

/* ------------------------------------------------------------------ icons (never colour alone, COPY §3) */

function bandShape(shape: string, color: string, size = 14): string {
  const s = size;
  const h = s / 2;
  const sw = Math.max(1.2, s / 12);
  let body: string;
  switch (shape) {
    case "half": {
      const r = h - sw;
      body = `<circle cx="${h}" cy="${h}" r="${r}" fill="${color}" stroke="var(--shape-edge)" stroke-width="${sw}"/>
<rect x="${h - r * 0.62}" y="${h - sw * 0.9}" width="${r * 1.24}" height="${sw * 1.8}" rx="${sw * 0.9}" fill="var(--shape-edge)"/>`;
      break;
    }
    case "triangle":
      body = `<path d="M${h} ${sw * 1.2} L${s - sw} ${s - sw * 1.4} L${sw} ${s - sw * 1.4}Z" fill="${color}" stroke="var(--shape-edge)" stroke-width="${sw}" stroke-linejoin="round"/>`;
      break;
    case "octagon": {
      const r = h - sw * 0.8;
      const pts = Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i + Math.PI / 8;
        return `${(h + r * Math.cos(a)).toFixed(2)},${(h + r * Math.sin(a)).toFixed(2)}`;
      }).join(" ");
      body = `<polygon points="${pts}" fill="${color}" stroke="var(--shape-edge)" stroke-width="${sw}" stroke-linejoin="round"/>`;
      break;
    }
    default:
      body = `<circle cx="${h}" cy="${h}" r="${h - sw}" fill="${color}" stroke="var(--shape-edge)" stroke-width="${sw}"/>`;
  }
  return `<svg class="shape" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${body}</svg>`;
}

/** Apfel Grotezk has no ▲▼ glyphs (SPEC v1.5), so trend arrows are drawn. */
function trendIcon(direction: "up" | "down" | "steady"): string {
  const d = direction === "up" ? "M6 1.5 11 10.5H1Z" : direction === "down" ? "M6 10.5 1 1.5h10Z" : "M2 1.5 10.5 6 2 10.5Z";
  return `<svg class="arrow" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="${d}" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>`;
}

const ARROWS = { up: "▲", down: "▼", steady: "▶" } as const;

/* ------------------------------------------------------------------ render */

const isDark = () => document.documentElement.dataset.theme === "dark" || matchMedia("(prefers-color-scheme: dark)").matches;
function bandColor(s: Snapshot): string {
  const info = bandInfo(s.band);
  return s.band === "very_high" && isDark() ? "#B06BC4" : info.color;
}

function render(s: Snapshot, place: Place) {
  const body = $("#live-body");
  const card = $("#live");
  if (!body || !card) return;
  const info = bandInfo(s.band);
  const color = bandColor(s);
  const point = place.kind === "area" ? place.point : null;
  const placeName = place.kind === "area" ? place.name : undefined;
  const v = verdict(s.band, ["general"], s.trend, { stale: s.stale, observedAt: s.observedAt, history: s.history });
  const prov = provenance(s, point, Date.now(), { placeName });
  const trendTxt = s.stale ? "" : trendWords(s.history);
  const psi = officialPsiLabel(s.officialPsi24h, psiLabel);

  card.style.setProperty("--band", color);
  card.dataset.band = s.band;
  body.setAttribute("aria-busy", "false");
  body.innerHTML = `
    <p class="verdict">${esc(v.headline)}</p>
    ${v.secondLine ? `<p class="second">${esc(v.secondLine)}</p>` : ""}
    <div class="num-row">
      <span class="num">${s.pm25}</span>
      <span class="unit">µg/m³<span>PM2.5 · last hour</span></span>
    </div>
    <p class="unc">${esc(uncertaintyLine(s, point, { placeName }))}</p>
    <p class="chips">
      <span class="chip${s.stale ? " chip-old" : ""}">${bandShape(info.shape, color)}${esc(info.label)}${s.stale ? " (old)" : ""}</span>
      ${trendTxt && !trendTxt.startsWith("Trend not") ? `<span class="trend">${trendIcon(s.trend.direction)}${esc(trendTxt)}</span>` : ""}
    </p>
    <p class="anchor">${esc(bandAnchor(s.band))}</p>
    <div class="official">
      <p><strong>${esc(psi)}</strong><span>24-hour average</span></p>
      <a href="#two-clocks">Why two numbers?</a>
    </div>
    <p class="prov">${esc(prov.full)}</p>`;

  // The same reading in the demo: menu bar illustration and CLI output.
  const compact = `<span class="dot" style="color:${color}">●</span> ${s.pm25} ${ARROWS[s.trend.direction]}`;
  document.querySelectorAll<HTMLElement>('[data-live="compact"]').forEach((el) => (el.innerHTML = compact));
  const flags = esc(cliFlags(place));
  const oneline = $('[data-live="oneline"]');
  if (oneline) oneline.innerHTML = `${compact}${s.stale ? ' <span class="t-dim">stale</span>' : ""}`;
  const jsonBand = $('[data-live="json-band"]');
  if (jsonBand) jsonBand.textContent = s.band;
  document.querySelectorAll<HTMLElement>("[data-live-flags]").forEach((el) => (el.innerHTML = flags));
}

function renderError(retry: () => void) {
  const body = $("#live-body");
  if (!body) return;
  body.setAttribute("aria-busy", "false");
  body.innerHTML = `<p class="verdict">Can't reach NEA's data right now</p>
    <p class="second">We'll try again in a few minutes.</p>
    <p><button class="btn btn-ghost btn-sm" type="button" id="retry">Try again</button></p>`;
  $("#retry")?.addEventListener("click", retry);
}

/* ------------------------------------------------------------------ live loop */

let place = initialPlace();
let lastOk = 0;
let inflight: AbortController | null = null;

async function load() {
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  const q =
    place.kind === "island" ? { region: "island" } : place.kind === "region" ? { region: place.region } : { lat: place.point.lat, lon: place.point.lon };
  const forPlace = place;
  try {
    const s = await getSnapshot({ ...q, signal: ctrl.signal });
    if (forPlace !== place) return;
    lastOk = Date.now();
    render(s, place);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    console.warn("HazeNow: live reading failed", e);
    if (!lastOk) renderError(load);
  }
}

function setPlace(p: Place) {
  place = p;
  // The shared line only describes the place from the link; once the reader picks another place, drop it.
  const line = $("#shared-line");
  if (line && p !== shared) line.hidden = true;
  try {
    localStorage.setItem(STORE_KEY, placeValue(p));
  } catch {
    /* private mode: fine, the choice just isn't remembered */
  }
  const link = appLink(p);
  document.querySelectorAll<HTMLAnchorElement>("[data-app-link]").forEach((a) => (a.href = link));
  const body = $("#live-body");
  body?.setAttribute("aria-busy", "true");
  body?.classList.add("is-loading");
  load().finally(() => body?.classList.remove("is-loading"));
}

const sharedLine = $("#shared-line");
if (shared && sharedLine) {
  sharedLine.textContent = `Shared with you: ${airPhrase(shared)}`;
  sharedLine.hidden = false;
}

const sel = $<HTMLSelectElement>("#place");
if (sel) {
  buildSelect(sel, place);
  sel.addEventListener("change", () => {
    const p = placeFromValue(sel.value);
    if (p) setPlace(p);
  });
}
document.querySelectorAll<HTMLAnchorElement>("[data-app-link]").forEach((a) => (a.href = appLink(place)));
load();
setInterval(() => {
  if (document.visibilityState === "visible") load();
}, REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastOk > REFRESH_MS) load();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => lastOk && load());

initSea(APP_BASE);

/* ------------------------------------------------------------------ copy script */

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const status = btn.closest(".plat")?.querySelector<HTMLElement>(".copy-status");
    try {
      const res = await fetch(btn.dataset.copy as string);
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      if (status) status.textContent = "Copied. Paste it into a new Scriptable script.";
    } catch {
      if (status) status.innerHTML = `Couldn't copy. <a href="${esc(btn.dataset.copy as string)}">Open the script</a> and copy it from there.`;
    }
  });
});
