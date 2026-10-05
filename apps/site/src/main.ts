/**
 * hazenow.pages.dev landing page: the live reading in the hero (reusing packages/core, so the maths and the words
 * match every HazeNow app), plus the "Copy script" button. No framework, no cookies; anonymous totals only (docs/PRIVACY.md).
 */
import {
  SG_AREAS,
  bandAnchor,
  bandInfo,
  deviceGuessInput,
  findArea,
  getSnapshot,
  locationDeniedLine,
  nearestArea,
  roundCoord,
  searchAreas,
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
import { initFind, type FindOption } from "./place-find";
// Shared with the web app (one copy of the in-app-browser hint, COPY §21).
import { showInAppHint } from "../../web/src/install-hints";
import { count } from "../../web/src/count";
import "./count-site"; // download clicks, counted in total only

const APP_BASE = __APP_BASE__;
const STORE_KEY = "hazenow-site-place";
const REFRESH_MS = 5 * 60_000;

type Place =
  | { kind: "island" }
  | { kind: "region"; region: string }
  | { kind: "area"; name: string; point: LatLon }
  /** SPEC v2.1: a place outside Singapore (catalogue slug; the name fills in once hero-country.ts loads). */
  | { kind: "city"; cc: string; id: string; name: string }
  /** "Use my location" in Singapore: a point rounded to 2 decimals (~1 km, SPEC v1.4 §5), kept on this device. */
  | { kind: "gps"; point: LatLon };

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
  if (v.startsWith("g:")) {
    const [lat, lon] = v.slice(2).split(",").map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { kind: "gps", point: { lat: roundCoord(lat), lon: roundCoord(lon) } } : null;
  }
  if (v.startsWith("a:")) {
    const a = findArea(v.slice(2));
    return a ? { kind: "area", name: a.name, point: { lat: a.lat, lon: a.lon } } : null;
  }
  return null;
}
const placeValue = (p: Place) =>
  p.kind === "island"
    ? "island"
    : p.kind === "region"
      ? `r:${p.region}`
      : p.kind === "city"
        ? `c:${p.cc}:${p.id}`
        : p.kind === "gps"
          ? `g:${p.point.lat},${p.point.lon}`
          : `a:${p.name}`;

const REGIONS = ["north", "south", "east", "west", "central"];

/**
 * A place from a share link. Cards link to `?area=<name or slug>` (web: "Jurong%20East", Android: "jurong-east")
 * or `?region=<name>` (share.ts / COPY §15). findArea normalises case and punctuation, so both forms resolve.
 */
function sharedPlace(q: URLSearchParams): Place | null {
  // SPEC v2.1: a card from outside Singapore links to `?country=th&area=bangkok`. The name fills in once the catalogue loads.
  const cc = q.get("country")?.trim().toUpperCase();
  if (cc && cc !== "SG" && /^[A-Z]{2}$/.test(cc)) {
    const id = (q.get("area") ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { kind: "city", cc, id, name: "" };
  }
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
  if (p.kind === "gps") return "air near you";
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
  // Near you: the app gets the nearest town's name, never the coordinates.
  if (p.kind === "gps") return `${APP_BASE}?area=${encodeURIComponent(nearestArea(p.point).name)}`;
  return `${APP_BASE}?area=${encodeURIComponent(p.name)}`;
}

function cliFlags(p: Place): string {
  if (p.kind === "island" || p.kind === "city") return " --region island";
  if (p.kind === "region") return ` --region ${p.region}`;
  if (p.kind === "gps") return ` --area "${nearestArea(p.point).name}"`;
  return ` --area "${p.name}"`;
}

/** Show the rest of Southeast Asia in the empty list (not for a Singapore guess, whose page stays exactly as it was). */
const seaMenu = () => place.kind === "city" || (fromGuess && guess.country !== "SG") || (!fromGuess && !shared && savedPlace()?.kind === "city");

let heroLoaded: HeroModule | null = null;
const hero = () => loadHero().then((m) => (heroLoaded = m));

const ISLAND_LABEL = "Singapore (island average)";
const stationLabel = (r: string) => `${regionLabel(r)} station`;

/** What the "Your area" field shows for a place. */
function placeLabel(p: Place): string {
  if (p.kind === "island") return ISLAND_LABEL;
  if (p.kind === "region") return stationLabel(p.region);
  if (p.kind === "area") return p.name;
  if (p.kind === "gps") return "Near you";
  return p.name && heroLoaded ? `${p.name}, ${heroLoaded.countryName(p.cc as never)}` : p.name;
}

const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** The list under the field: everything when it's empty, matches as the visitor types. All on the device. */
function findOptions(query: string): FindOption[] {
  const q = norm(query);
  const out: FindOption[] = [];
  const island: FindOption = { value: "island", label: ISLAND_LABEL, group: "Singapore" };
  const stations = REGIONS.map((r): FindOption => ({ value: `r:${r}`, label: stationLabel(r), group: "NEA stations" }));
  if (!q) {
    out.push(island, ...stations);
    for (const a of [...SG_AREAS].sort((x, y) => x.name.localeCompare(y.name))) out.push({ value: `a:${a.name}`, label: a.name, group: "Towns and planning areas" });
    if (heroLoaded && seaMenu()) {
      const m = heroLoaded;
      const list = m.menuPlaces();
      const here = place;
      if (here.kind === "city" && !list.some((c) => c.country === here.cc && c.id === here.id)) {
        const c = m.findPlace(here.cc, here.id);
        if (c) list.unshift(c);
      }
      for (const c of list) out.push({ value: `c:${c.country}:${c.id}`, label: `${c.name}, ${m.countryName(c.country)}`, group: "Southeast Asia" });
    }
    return out;
  }
  if ("singapore island average".includes(q) || norm(ISLAND_LABEL).startsWith(q)) out.push(island);
  for (const a of searchAreas(query, 8))
    out.push({ value: `a:${a.name}`, label: a.name, group: "Singapore", sub: a.matched ? `Includes ${a.matched}` : undefined });
  out.push(...stations.filter((o) => norm(o.label).split(" ").some((w) => w.startsWith(q))));
  // The rest of the region, from the same bundled catalogue (loaded on demand, still nothing sent).
  if (q.length >= 2) {
    if (!heroLoaded) hero().then(() => find?.refresh());
    else
      for (const { place: c, matched } of heroLoaded.sea.searchPlaces(query, 6))
        out.push({
          value: `c:${c.country}:${c.id}`,
          label: `${c.name}, ${heroLoaded.countryName(c.country)}`,
          group: "Southeast Asia",
          sub: matched ? `Includes ${matched}` : undefined,
        });
  }
  return out;
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
  const more = $("#live-more-body");
  const card = $("#live");
  if (!body || !card) return;
  const info = bandInfo(s.band);
  const color = bandColor(s);
  const point = place.kind === "area" || place.kind === "gps" ? place.point : null;
  const placeName = place.kind === "area" ? place.name : undefined;
  const v = verdict(s.band, ["general"], s.trend, { stale: s.stale, observedAt: s.observedAt, history: s.history });
  const prov = provenance(s, point, Date.now(), { placeName });
  const trendTxt = s.stale ? "" : trendWords(s.history);
  const psi = officialPsiLabel(s.officialPsi24h, psiLabel);

  setBand(color, s.band);
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
    </p>`;
  if (more)
    more.innerHTML = `
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

/** The band colour on the card's top rule and pip, and on the details panel under it. */
function setBand(color: string, band?: string) {
  for (const el of [$("#live"), $("#live-more")]) {
    if (!el) continue;
    el.style.setProperty("--band", color);
    if (band) el.dataset.band = band;
    else delete el.dataset.band;
  }
}

function renderError(retry: () => void) {
  const body = $("#live-body");
  const more = $("#live-more-body");
  if (more) more.innerHTML = "";
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
  title: $("#live-title")?.innerHTML ?? "",
  why: $("#loc-why")?.textContent ?? "",
};
function heroWords(country: string | null, agency: string | null, preview: boolean) {
  const set = (sel: string, text: string, html = false) => {
    const el = $(sel);
    if (el) html ? (el.innerHTML = text) : (el.textContent = text);
  };
  if (!country) {
    set(".hero .eyebrow", HERO_SG.eyebrow);
    set(".hero .lede", HERO_SG.lede);
    set("#live-title", HERO_SG.title, true);
    set("#loc-why", HERO_SG.why);
    return;
  }
  const named = agency && agency !== "community sensors";
  set(".hero .eyebrow", `${country} · the last hour's PM2.5, by place`);
  // COPY §21: the same sub-line, with the place's own authority in NEA's place.
  set(".hero .lede", `${named ? `${agency}'s` : "The"} 1-hour PM2.5 for your area, turned into plain advice you can act on right now.`);
  set("#live-title", `<span class="live-pip" aria-hidden="true"></span>${esc(preview ? "Recorded reading (preview)" : `${named ? `${agency}'s` : "The"} latest reading`)}`, true);
  set("#loc-why", "We only use this to find your nearest station. It stays on your phone.");
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
  el.querySelector("[data-guess-change]")?.addEventListener("click", () => find?.focus());
}

/** Keep the field and the "Open HazeNow" links in step with the place on screen. */
function syncPlaceUi(p: Place) {
  find?.set(placeValue(p), placeLabel(p));
  const link = appLink(p);
  document.querySelectorAll<HTMLAnchorElement>("[data-app-link]").forEach((a) => (a.href = link));
}

/** A place outside Singapore: resolve it against the catalogue (a guess gets startPlace's nearest-covered rule). */
async function loadCity(ctrl: AbortController, forPlace: Place & { kind: "city" }): Promise<void> {
  const m = await hero();
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
    syncPlaceUi(place);
    return load();
  }
  forPlace.name = c.name;
  forPlace.id = c.id;
  forPlace.cc = c.country;
  if (forPlace === shared) showSharedLine();
  syncPlaceUi(forPlace);
  guessLineUpdate();
  const body = $("#live-body");
  const more = $("#live-more-body");
  if (!body) return;
  try {
    const r = await m.renderCountryHero(body, more, c, ctrl.signal, (sh, color) => bandShape(sh, color));
    if (!r || forPlace !== place) return;
    lastOk = Date.now();
    body.setAttribute("aria-busy", "false");
    setBand(r.color);
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
    place.kind === "island"
      ? { region: "island" }
      : place.kind === "region"
        ? { region: place.region }
        : { lat: place.point.lat, lon: place.point.lon };
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
  syncPlaceUi(p);
  const body = $("#live-body");
  body?.setAttribute("aria-busy", "true");
  body?.classList.add("is-loading");
  load().finally(() => body?.classList.remove("is-loading"));
}

function showSharedLine() {
  const line = $("#shared-line");
  if (!shared || !line || (shared.kind === "city" && !shared.name)) return;
  line.textContent = `Shared with you: ${airPhrase(shared)}`;
  line.hidden = false;
}
showSharedLine();

const placeInput = $<HTMLInputElement>("#place");
const placeList = $<HTMLUListElement>("#place-list");
const find =
  placeInput && placeList
    ? initFind(placeInput, placeList, findOptions, (v) => {
        const p = placeFromValue(v);
        if (!p) return;
        if (p.kind === "city") hero().then(() => setPlace(p));
        else setPlace(p);
      })
    : null;
// A place outside Singapore (or a menu that lists them) needs the catalogue for its name.
if (seaMenu()) hero().then(() => syncPlaceUi(place));
syncPlaceUi(place);
guessLineUpdate();
load();
firmUpGuess();
// A share link opened inside WhatsApp & co: say how to reach Safari or Chrome, with the link (and its place) to copy.
if (showInAppHint(() => (shared && place === shared ? location.href : `${location.origin}/${appLink(place).slice(APP_BASE.length)}`)))
  count("install_prompt_shown", { kind: "inapp" });

/* ------------------------------------------------------------------ use my location (on this device only) */

const locBtn = $<HTMLButtonElement>("#use-loc");
const locLabel = locBtn?.querySelector("span");
function locNote(text: string | null) {
  const why = $("#loc-why");
  if (!why) return;
  if (text === null) heroWords(null, null, false); // restores the privacy line (country pages re-set it on load)
  else why.textContent = text;
}
locBtn?.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    locNote(locationDeniedLine(placeLabel(place)));
    return;
  }
  locBtn.disabled = true;
  if (locLabel) locLabel.textContent = "Finding your spot…";
  const done = () => {
    locBtn.disabled = false;
    if (locLabel) locLabel.textContent = "Use my location";
  };
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      done();
      // Rounded to ~1 km straight away (SPEC v1.4 §5). It's used here, on the device, and never sent.
      const point = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude) };
      const inSg = point.lat >= 1.2 && point.lat <= 1.44 && point.lon >= 103.6 && point.lon <= 104.05;
      const m = inSg ? null : await hero();
      // SPEC v2.0 §3: the reading's jurisdiction decides (a Johor Bahru point never gets NEA's reading).
      const cc = m ? m.sea.countryAt(point.lat, point.lon) : "SG";
      if (cc === "SG" && (inSg || m)) {
        setPlace({ kind: "gps", point });
        return;
      }
      const c = cc && m ? m.nearestCity(cc, point) : null;
      if (c) setPlace({ kind: "city", cc: c.country, id: c.id, name: c.name });
      else locNote("HazeNow doesn't cover where you are yet. Type a place to see its air.");
    },
    (err) => {
      done();
      locNote(err.code === err.PERMISSION_DENIED ? locationDeniedLine(placeLabel(place)) : "Couldn't find your spot. Type your area instead.");
    },
    { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
  );
});

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
  syncPlaceUi(place);
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
