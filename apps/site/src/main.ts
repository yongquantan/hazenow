/**
 * hazenow.pages.dev landing page: the live reading in the hero (reusing packages/core, so the maths and the words
 * match every HazeNow app), plus the "Copy script" button. No framework, no analytics, no cookies.
 */
import {
  SG_AREAS,
  bandAnchor,
  bandInfo,
  deviceGuessInput,
  findArea,
  getSnapshot,
  guessCountry,
  wantsServerHint,
  type CountryGuess,
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
import { countShareLanding } from "./hit";

const APP_BASE = __APP_BASE__;
const STORE_KEY = "hazenow-site-place";
const REFRESH_MS = 5 * 60_000;

type Place =
  | { kind: "island" }
  | { kind: "region"; region: string }
  | { kind: "area"; name: string; point: LatLon }
  /** SPEC v2.1: a place outside Singapore (catalogue slug; the name fills in once hero-country.ts loads). */
  | { kind: "city"; cc: string; id: string; name: string };

type HeroModule = typeof import("./hero-country");
let heroMod: Promise<HeroModule> | null = null;
const loadHero = () => (heroMod ??= import("./hero-country"));

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
  else countShareLanding(import.meta.env.VITE_HIT_URL || import.meta.env.VITE_PROXY_URL); // ?s=<card>: one anonymous +1
}

/* ------------------------------------------------------------------ place */

function placeFromValue(v: string | null | undefined): Place | null {
  if (!v) return null;
  if (v === "island") return { kind: "island" };
  if (v.startsWith("r:")) return { kind: "region", region: v.slice(2) };
  if (v.startsWith("c:")) {
    const [, cc, id] = v.split(":");
    return cc && id ? { kind: "city", cc: cc.toUpperCase(), id, name: "" } : null;
  }
  if (v.startsWith("a:")) {
    const a = findArea(v.slice(2));
    return a ? { kind: "area", name: a.name, point: { lat: a.lat, lon: a.lon } } : null;
  }
  return null;
}
const placeValue = (p: Place) =>
  p.kind === "island" ? "island" : p.kind === "region" ? `r:${p.region}` : p.kind === "city" ? `c:${p.cc}:${p.id}` : `a:${p.name}`;

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
  if (p.kind === "city") return `air in ${p.name}`;
  if (p.kind === "area") return `air in ${p.name}`;
  if (p.kind === "island") return "air across Singapore";
  return p.region === "central" ? "air in Central" : `air in the ${regionLabel(p.region)}`;
}

const params = new URLSearchParams(location.search);
const shared = sharedPlace(params);
/** The share link's own query (area/region/s), passed on untouched while the shared place is showing. */
const sharedQuery = shared ? location.search : "";

/**
 * SPEC v2.1: the device's country guess (time zone + languages, read here, nothing sent). Used only when there's no
 * share link and no saved choice. A Singapore guess keeps the page exactly as it was.
 */
const deviceInput = deviceGuessInput();
let guess: CountryGuess = guessCountry(deviceInput);
/** The place on screen came from the guess (not a link or the reader's choice), so a firmer guess may move it. */
let fromGuess = false;
/** The guessed country isn't covered yet; the card shows the nearest covered city. */
let notCoveredFrom: string | null = null;

function savedPlace(): Place | null {
  try {
    return placeFromValue(localStorage.getItem(STORE_KEY));
  } catch {
    return null;
  }
}

const guessPlace = (g: CountryGuess): Place =>
  g.country && g.country !== "SG" ? { kind: "city", cc: g.country, id: g.place ?? "", name: "" } : { kind: "island" };

function initialPlace(): Place {
  if (shared) return shared;
  const saved = savedPlace();
  if (saved) return saved;
  fromGuess = true;
  return guessPlace(guess);
}

function appLink(p: Place): string {
  if (shared && p === shared) return APP_BASE + sharedQuery;
  // The app carries the guessed (or picked) country and area. Outside SEA, the app makes its own guess.
  if (p.kind === "city") return `${APP_BASE}?country=${p.cc.toLowerCase()}&area=${encodeURIComponent(p.id)}`;
  if (fromGuess && !guess.country) return APP_BASE;
  if (p.kind === "island") return `${APP_BASE}?region=island`;
  if (p.kind === "region") return `${APP_BASE}?region=${encodeURIComponent(p.region)}`;
  return `${APP_BASE}?area=${encodeURIComponent(p.name)}`;
}

function cliFlags(p: Place): string {
  if (p.kind === "island" || p.kind === "city") return " --region island";
  if (p.kind === "region") return ` --region ${p.region}`;
  return ` --area "${p.name}"`;
}

/** Show the rest of Southeast Asia in the menu (not for a Singapore guess, whose page stays exactly as it was). */
const seaMenu = () => place.kind === "city" || (fromGuess && guess.country !== "SG") || (!fromGuess && !shared && savedPlace()?.kind === "city");

async function buildSelect(sel: HTMLSelectElement, current: Place) {
  let seaGroup = "";
  if (seaMenu()) {
    const m = await loadHero();
    const list = m.menuPlaces();
    if (current.kind === "city" && !list.some((c) => c.country === current.cc && c.id === current.id)) {
      const c = m.findPlace(current.cc, current.id);
      if (c) list.unshift(c);
    }
    seaGroup = `<optgroup label="Southeast Asia">${list
      .map((c) => `<option value="c:${c.country}:${esc(c.id)}">${esc(`${c.name}, ${m.countryName(c.country)}`)}</option>`)
      .join("")}</optgroup>`;
  }
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
<optgroup label="Towns and planning areas">${areas}</optgroup>${seaGroup}`;
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

/* SPEC v2.1: the hero's words follow the country on screen (restored exactly for Singapore). */
const HERO_SG = {
  eyebrow: $(".hero .eyebrow")?.textContent ?? "",
  lede: $(".hero .lede")?.textContent ?? "",
  lede2: $(".hero .lede-2")?.textContent ?? "",
  title: $("#live-title")?.innerHTML ?? "",
};
function heroWords(country: string | null, agency: string | null, preview: boolean) {
  const set = (sel: string, text: string, html = false) => {
    const el = $(sel);
    if (el) html ? (el.innerHTML = text) : (el.textContent = text);
  };
  if (!country) {
    set(".hero .eyebrow", HERO_SG.eyebrow);
    set(".hero .lede", HERO_SG.lede);
    set(".hero .lede-2", HERO_SG.lede2);
    set("#live-title", HERO_SG.title, true);
    return;
  }
  const who = agency && agency !== "community sensors" ? `${agency}'s` : "The";
  set(".hero .eyebrow", `${country} · the last hour's PM2.5, by place`);
  set(".hero .lede", "Official indexes often average 24 hours. PM2.5 shows the last hour.");
  set(".hero .lede-2", "HazeNow puts the last hour first, with the local authority's own words and advice in plain language, so you can decide what to do right now.");
  set("#live-title", `<span class="live-pip" aria-hidden="true"></span>${esc(preview ? "Recorded reading (preview)" : `${who} latest reading`)}`, true);
}

/** "Showing Bangkok · Change" over the card, for a guessed place (and a hint for visitors from outside SEA). */
function guessLineUpdate() {
  const el = $("#guess-line");
  if (!el) return;
  if (!fromGuess || shared) {
    el.hidden = true;
    return;
  }
  const change = `<button class="link-btn" type="button" data-guess-change>Change</button>`;
  if (place.kind === "city") {
    el.innerHTML = notCoveredFrom
      ? `${esc(notCoveredFrom)} isn't available yet. Showing <b>${esc(place.name)}</b>, the nearest place we cover. ${change}`
      : `Showing <b>${esc(place.name)}</b> · ${change}`;
  } else if (!guess.country && guess.confidence !== "low") {
    el.innerHTML = `Not in Singapore? HazeNow also covers Thailand, with more of Southeast Asia in preview. ${change}`;
  } else {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.querySelector("[data-guess-change]")?.addEventListener("click", () => $<HTMLSelectElement>("#place")?.focus());
}

/** A place outside Singapore: resolve it against the catalogue (a guess gets startPlace's nearest-covered rule). */
async function loadCity(ctrl: AbortController, forPlace: Place & { kind: "city" }): Promise<void> {
  const m = await loadHero();
  let c = m.findPlace(forPlace.cc, forPlace.id);
  if (fromGuess) {
    const start = m.sea.startPlace(guess);
    c = start.place;
    notCoveredFrom = start.notCoveredFrom ? m.countryName(start.notCoveredFrom) : null;
  }
  if (!c) c = m.sea.isCountryCode(forPlace.cc) ? m.sea.defaultCity(forPlace.cc) : null;
  if (!c || c.country === "SG") {
    place = { kind: "island" };
    heroWords(null, null, false);
    guessLineUpdate();
    return load();
  }
  forPlace.name = c.name;
  forPlace.id = c.id;
  forPlace.cc = c.country;
  document.querySelectorAll<HTMLAnchorElement>("[data-app-link]").forEach((a) => (a.href = appLink(forPlace)));
  const sel = $<HTMLSelectElement>("#place");
  if (sel && ![...sel.options].some((o) => o.value === placeValue(forPlace))) await buildSelect(sel, forPlace);
  else if (sel) sel.value = placeValue(forPlace);
  guessLineUpdate();
  const body = $("#live-body");
  const card = $("#live");
  if (!body || !card) return;
  try {
    const r = await m.renderCountryHero(body, c, ctrl.signal, (sh, color) => bandShape(sh, color));
    if (!r || forPlace !== place) return;
    lastOk = Date.now();
    body.setAttribute("aria-busy", "false");
    card.style.setProperty("--band", r.color);
    delete card.dataset.band;
    heroWords(m.countryName(c.country), r.agency, r.mode === "preview");
  } catch (e) {
    if (ctrl.signal.aborted) return;
    console.warn("HazeNow: live reading failed", e);
    if (!lastOk) renderError(load);
  }
}

async function load(): Promise<void> {
  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;
  if (place.kind === "city") return loadCity(ctrl, place);
  heroWords(null, null, false);
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
  fromGuess = false;
  notCoveredFrom = null;
  guessLineUpdate();
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
guessLineUpdate();
load();
firmUpGuess();

/**
 * SPEC v2.1 optional server hint: only when the device guess isn't sure, ask /api/where (this site's Pages Function,
 * {country} only, no-store). Never blocks the first render, and only moves a place that came from the guess.
 */
async function firmUpGuess() {
  if (!fromGuess || !wantsServerHint(guess)) return;
  let country: string | null = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch("/api/where", { cache: "no-store", credentials: "omit", signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) return;
    const body = (await res.json()) as { country?: unknown };
    country = typeof body?.country === "string" ? body.country : null;
  } catch {
    return;
  }
  if (!country || !fromGuess) return;
  const next = guessCountry({ ...deviceInput, serverCountry: country });
  const moved = next.country !== guess.country || next.place !== guess.place;
  guess = next;
  if (!moved) {
    guessLineUpdate();
    return;
  }
  place = guessPlace(next);
  notCoveredFrom = null;
  if (sel) await buildSelect(sel, place);
  document.querySelectorAll<HTMLAnchorElement>("[data-app-link]").forEach((a) => (a.href = appLink(place)));
  guessLineUpdate();
  load();
}
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
