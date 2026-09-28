import "./styles.css";
import {
  actions,
  backoffMs,
  badgeSvg,
  bandAnchor,
  bandInfo,
  calmLine,
  CHART_COPY,
  findArea,
  nearestArea,
  type ShareCardId,
  FOOTER_LINE,
  formatSgtTime,
  getSnapshot,
  haversineKm,
  headlineLabel,
  isStale,
  NEA_FORECAST_URL,
  nearestRegionAny,
  nextPollDelayMs,
  normaliseProfile,
  officialPsiLabel,
  OFFICIAL_CAPTION,
  PLANNING_LINE,
  PRIVACY_LINE,
  PROFILES,
  provenance,
  psiLabel,
  refreshStale,
  REGION_COORDS,
  REGION_ORDER,
  regionLabel,
  roundCoord,
  scenarioFetch,
  SCENARIOS,
  searchAreas,
  shareText,
  uncertaintyLine,
  trendWord,
  trendWords,
  uncertainty,
  verdict,
  WHY_TWO_NUMBERS,
  WHY_TWO_NUMBERS_LINK,
  type FetchLike,
  type LatLon,
  type Profile,
  type Scenario,
  type Snapshot,
} from "hazenow";
import { chartSvg } from "./chart";
import { mapSvg } from "./map";
import { bandShape, esc, store, trendIcon } from "./util";

const SITE = "hazenow.sg";
const SITE_URL = "https://hazenow.sg/";
const REPO_URL = "https://github.com/yongquantan/hazenow";
const LINKEDIN_URL = "https://www.linkedin.com/in/yongquantan";

/* ---------------------------------------------------------------- places (SPEC v1.4) */

/** Where to check. Coordinates are always rounded to 2 decimals (~1 km) before use or storage. */
type Place =
  | { kind: "gps"; point: LatLon }
  | { kind: "area"; name: string; point: LatLon }
  | { kind: "region"; region: string }
  | { kind: "island" };
type Slot = "home" | "work" | "other";
const SLOTS: { id: Slot; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "work", label: "Work/School" },
  { id: "other", label: "Another place" },
];

const placeLabelOf = (p: Place): string =>
  p.kind === "gps" ? "Near you" : p.kind === "area" ? p.name : p.kind === "region" ? regionLabel(p.region) : "Singapore";
const placeKey = (p: Place): string =>
  p.kind === "region" ? p.region : p.kind === "island" ? "island" : `pt:${p.point.lat},${p.point.lon}`;
const pointOf = (p: Place): LatLon | null => (p.kind === "gps" || p.kind === "area" ? p.point : null);
const samePlace = (a: Place | undefined, b: Place) => !!a && placeKey(a) === placeKey(b) && a.kind === b.kind;
const rounded = (pt: LatLon): LatLon => ({ lat: roundCoord(pt.lat), lon: roundCoord(pt.lon) });

type SheetMode = null | { assign: Slot | null };

interface State {
  where: Place;
  firstRun: boolean;
  places: Partial<Record<Slot, Place>>;
  sheet: SheetMode;
  search: string;
  geoExplain: boolean;
  geoBlocked: boolean;
  profile: Profile[];
  profileSet: boolean;
  profileOpen: boolean;
  snap: Snapshot | null;
  fromCache: boolean;
  error: "offline" | "api" | "nodata" | null;
  loading: boolean;
  locating: boolean;
  locNote: string | null;
  lastChecked: number | null;
  nextCheck: number | null;
  online: boolean;
  toast: string | null;
  aboutOpen: boolean;
}

const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "1";
const MOCK = (SCENARIOS as readonly string[]).includes(params.get("mock") ?? "") ? (params.get("mock") as string) : null;
const themeParam = params.get("theme");
if (themeParam === "dark" || themeParam === "light") document.documentElement.dataset.theme = themeParam;

/* Mock mode: deterministic scenarios from packages/core/fixtures/scenarios, clock frozen at the scenario's "now". */
let mockScenario: Scenario | null = null;
const mockFiles = import.meta.glob<Scenario>("../../../packages/core/fixtures/scenarios/*.json", { import: "default" });
const nowMs = () => (mockScenario ? Date.parse(mockScenario._meta.now) : Date.now());

/** URL params win (shared links, embeds); then the saved choice; otherwise first run (island view). */
function initialWhere(): { where: Place; firstRun: boolean } {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { where: { kind: "gps", point: rounded({ lat, lon }) }, firstRun: false };
  }
  const area = params.get("area") ? findArea(params.get("area")!) : null;
  if (area) return { where: { kind: "area", name: area.name, point: rounded(area) }, firstRun: false };
  const r = (params.get("region") ?? "").toLowerCase();
  if (r === "island") return { where: { kind: "island" }, firstRun: false };
  if (r in REGION_COORDS) return { where: { kind: "region", region: r }, firstRun: false };
  const saved = store.get<Place | null>("hn.where", null);
  if (saved) return { where: saved, firstRun: false };
  const legacy = store.get<string | null>("hn.region", null); // pre-v1.4 installs
  if (legacy && legacy in REGION_COORDS) return { where: { kind: "region", region: legacy }, firstRun: false };
  return { where: { kind: "island" }, firstRun: !EMBED };
}

const init = initialWhere();
const state: State = {
  where: init.where,
  firstRun: init.firstRun,
  places: store.get<Partial<Record<Slot, Place>>>("hn.places", {}),
  sheet: null,
  search: "",
  geoExplain: false,
  geoBlocked: store.get("hn.geoBlocked", false),
  profile: normaliseProfile(store.get<string[]>("hn.profile", ["general"])),
  profileSet: store.get("hn.profileSet", false),
  profileOpen: false,
  snap: null,
  fromCache: false,
  error: null,
  loading: false,
  locating: false,
  locNote: null,
  lastChecked: null,
  nextCheck: null,
  online: navigator.onLine,
  toast: null,
  aboutOpen: false,
};

const app = document.getElementById("app")!;
app.removeAttribute("aria-live"); // only the headline is announced (SPEC v1.2 §11)
document.documentElement.classList.toggle("is-embed", EMBED);
const announcer = document.createElement("p");
announcer.className = "sr-only";
announcer.setAttribute("aria-live", "polite");
document.body.append(announcer);
let announcedBand: string | null = null;

/* ---------------------------------------------------------------- data */

const cacheKey = () => `hn.snap.${placeKey(state.where)}`;
const cacheGet = (): Snapshot | null => (MOCK ? null : store.get<Snapshot | null>(cacheKey(), null));
let pollTimer: number | undefined;
let failures = 0;
let inflight: AbortController | null = null;

function query() {
  const w = state.where;
  if (w.kind === "gps" || w.kind === "area") return { lat: w.point.lat, lon: w.point.lon };
  if (w.kind === "island") return { region: "island" };
  return { region: w.region };
}

async function refresh(): Promise<void> {
  clearTimeout(pollTimer);
  inflight?.abort();
  const ctl = new AbortController();
  inflight = ctl;
  const timeout = setTimeout(() => ctl.abort(), 20_000);
  state.loading = true;
  renderStatus();
  try {
    let fetchImpl: FetchLike | undefined;
    if (MOCK) {
      mockScenario ??= await mockFiles[`../../../packages/core/fixtures/scenarios/${MOCK}.json`]();
      fetchImpl = scenarioFetch(mockScenario);
    }
    const snap = await getSnapshot({ ...query(), signal: ctl.signal, fetch: fetchImpl, now: nowMs(), retryDelayMs: MOCK ? 0 : undefined });
    if (ctl.signal.aborted) return;
    state.snap = snap;
    state.fromCache = false;
    state.error = null;
    if (!MOCK) store.set(cacheKey(), snap);
  } catch (e) {
    if (inflight !== ctl) return;
    const cached = cacheGet();
    if (cached && (!state.snap || state.fromCache)) {
      state.snap = refreshStale(cached, nowMs());
      state.fromCache = true;
    } else if (state.snap) {
      state.snap = refreshStale(state.snap, nowMs());
    }
    state.error = !navigator.onLine ? "offline" : (e as Error)?.name === "NoDataError" ? "nodata" : "api";
    console.warn("[hazenow]", (e as Error)?.message);
  } finally {
    clearTimeout(timeout);
    if (inflight === ctl) {
      inflight = null;
      state.loading = false;
      state.lastChecked = Date.now();
      failures = state.error ? failures + 1 : 0;
      const delay = state.error ? backoffMs(failures - 1) : nextPollDelayMs(Date.now(), state.snap?.observedAt);
      state.nextCheck = Date.now() + delay;
      if (!MOCK) pollTimer = window.setTimeout(refresh, delay);
      render();
    }
  }
}

/* ---------------------------------------------------------------- choosing a place */

/** Switch to a place (and optionally save it into a slot). Persists rounded coordinates only. */
function choose(place: Place, opts: { assign?: Slot | null; keepNote?: boolean } = {}) {
  if (!opts.keepNote) state.locNote = null;
  if (opts.assign) {
    state.places = { ...state.places, [opts.assign]: place };
    if (!MOCK) store.set("hn.places", state.places);
  }
  state.where = place;
  state.firstRun = false;
  state.sheet = null;
  state.search = "";
  state.geoExplain = false;
  if (!MOCK) store.set("hn.where", place);
  const cached = cacheGet();
  state.snap = cached ? refreshStale(cached, nowMs()) : null;
  state.fromCache = !!cached;
  render();
  refresh();
}

/** Ask for approximate location (only ever after the user taps and has seen the explainer). */
function locate(assign: Slot | null) {
  if (!("geolocation" in navigator)) {
    onGeoFail(false);
    return;
  }
  state.locating = true;
  state.geoExplain = false;
  state.locNote = "Finding your spot…";
  render();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.locating = false;
      const point = rounded({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      const nearestKm = Math.min(...Object.values(REGION_COORDS).map((c) => haversineKm(point, c)));
      if (nearestKm > 40) {
        const r = nearestRegionAny(REGION_COORDS, point) ?? "central";
        state.locNote = `You seem to be outside Singapore. Showing NEA's ${regionLabel(r)} station, the closest.`;
        choose({ kind: "region", region: r }, { keepNote: true });
        return;
      }
      state.geoBlocked = false;
      store.set("hn.geoBlocked", false);
      choose({ kind: "gps", point }, { assign });
    },
    (err) => {
      state.locating = false;
      onGeoFail(err.code === err.PERMISSION_DENIED);
    },
    { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
  );
}

/** Denied / unavailable: never re-prompt. Quietly open the area list; the island view stays underneath. */
function onGeoFail(denied: boolean) {
  if (denied) {
    state.geoBlocked = true;
    store.set("hn.geoBlocked", true);
  }
  state.locNote = null;
  state.sheet = { assign: state.sheet?.assign ?? null };
  state.search = "";
  render();
  (app.querySelector("#area-search") as HTMLInputElement | null)?.focus();
}

/** If location was granted before, refresh the rounded point silently (never prompts). */
async function refreshGrantedLocation() {
  if (state.where.kind !== "gps" || MOCK || !navigator.permissions?.query) return;
  try {
    const st = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (st.state !== "granted") return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = rounded({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        if (state.where.kind === "gps" && (point.lat !== state.where.point.lat || point.lon !== state.where.point.lon)) {
          choose({ kind: "gps", point });
        }
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  } catch {
    /* permissions API unsupported */
  }
}

/* ---------------------------------------------------------------- sharing */

let toastTimer: number | undefined;
function toast(msg: string) {
  state.toast = msg;
  clearTimeout(toastTimer);
  const t = document.querySelector(".toast");
  if (t) {
    t.textContent = msg;
    t.classList.remove("is-out");
  }
  toastTimer = window.setTimeout(() => {
    state.toast = null;
    document.querySelector(".toast")?.classList.add("is-out");
  }, 3200);
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("Couldn't copy. Select the text instead.");
  }
}

/** Place name printed on share cards: the picked area, the nearest area to a GPS point, or the region. */
function sharePlaceName(): string | undefined {
  const w = state.where;
  if (w.kind === "area") return w.name;
  if (w.kind === "gps") return nearestArea(w.point).name;
  return undefined; // regions and the island view use the core's own wording ("Air in the West")
}

/** Share link: carries the place (so the link preview can match) and the card. */
function shareLink(card: ShareCardId): string {
  const w = state.where;
  const q =
    w.kind === "area"
      ? `area=${encodeURIComponent(w.name)}`
      : w.kind === "gps"
        ? `area=${encodeURIComponent(nearestArea(w.point).name)}`
        : w.kind === "region"
          ? `region=${w.region}`
          : "region=island";
  return `${SITE_URL}?${q}&s=${card}`;
}

function openShare(opts: { initial?: ShareCardId; fromWhy?: boolean } = {}) {
  const s = state.snap;
  if (!s) return;
  const placeName = sharePlaceName();
  // The card renderer loads on first use, keeping the main bundle small.
  import("./sharesheet").then(({ openShareSheet }) => openShareSheet({
    snap: s,
    profile: state.profile,
    ctx: { placeName, point: point(), fromWhyTwoNumbers: opts.fromWhy },
    placeName: placeName ?? (state.where.kind === "region" ? regionLabel(state.where.region) : "singapore"),
    linkFor: shareLink,
    initial: opts.initial,
    toast,
  })).catch((e) => {
    console.warn(e);
    toast("Couldn't make the picture.");
  });
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------------------------------------------------------- views */

const point = () => pointOf(state.where);
const offline = () => state.fromCache && state.error === "offline";
const provOpts = () => ({ placeName: state.where.kind === "area" ? state.where.name : undefined });

/** 0 → clear, 300+ → heavy veil. Capped low: calm by default. */
function hazeLevel(pm25: number) {
  return Math.min(1, Math.max(0, pm25 / 300));
}

const pin = `<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="6.5" r="1.8" fill="currentColor"/></svg>`;
const target = `<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6" fill="currentColor"/><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

function header() {
  const open = !!state.sheet;
  return `<header class="top">
  ${ribbon()}
  <a class="brand" href="/" aria-label="HazeNow home">${logo()}<span>HazeNow</span></a>
  ${
    state.firstRun
      ? ""
      : `<button class="place-btn${open ? " is-open" : ""}" data-action="sheet" data-key="sheet" aria-expanded="${open}" aria-controls="places">
      ${state.where.kind === "gps" ? target : pin}<span>${esc(placeLabelOf(state.where))}</span>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>`
  }
</header>
${switcher()}
${state.sheet ? placesSheet() : ""}`;
}

/** Quick switcher: saved places as one-tap chips (SPEC v1.4 §2). */
function switcher() {
  const saved = SLOTS.filter((s) => state.places[s.id]);
  if (state.firstRun || saved.length === 0) return "";
  return `<nav class="switcher" aria-label="Saved places">
  ${saved
    .map((s) => {
      const p = state.places[s.id]!;
      const on = samePlace(state.where, p) ? " is-on" : "";
      return `<button class="chip-btn${on}" data-action="use-slot" data-slot="${s.id}" data-key="slot-${s.id}" aria-pressed="${!!on}"><b>${esc(s.label)}</b> ${esc(placeLabelOf(p))}</button>`;
    })
    .join("")}
</nav>`;
}

function areaResults() {
  const results = searchAreas(state.search, state.search ? 8 : 55);
  if (!results.length) return `<p class="fine">No match. Try a town like “Tampines” or “Jurong East”.</p>`;
  return `<ul class="area-list" role="list">${results
    .map(
      (a) =>
        `<li><button class="area-row" data-action="pick-area" data-area="${esc(a.name)}" data-key="area-${esc(a.name)}">${esc(a.name)}${
          a.matched ? ` <span class="area-alias">${esc(a.matched)}</span>` : ""
        }</button></li>`,
    )
    .join("")}</ul>`;
}

function geoControls(assign: Slot | null) {
  if (state.geoExplain) {
    return `<div class="geo-explain" role="group" aria-label="Use my location">
  <p>We only use this to find your nearest NEA station. It stays on your phone.</p>
  <div class="row-actions"><button class="btn btn-solid btn-sm" data-action="geo-go" data-assign="${assign ?? ""}" data-key="geo-go">Continue</button><button class="link" data-action="geo-cancel" data-key="geo-cancel">Not now</button></div>
</div>`;
  }
  return `<button class="btn btn-sm quiet-loc" data-action="geo-ask" data-key="geo-ask"${state.locating ? " disabled" : ""}>${target} ${
    state.locating ? "Finding your spot…" : "Use my location"
  }</button>${
    state.geoBlocked
      ? `<p class="fine">Location is turned off for this site. You can allow it in your browser's site settings, or pick your area.</p>`
      : ""
  }`;
}

function placesSheet() {
  const assign = state.sheet?.assign ?? null;
  const slotLabel = assign ? SLOTS.find((s) => s.id === assign)!.label : null;
  return `<section class="places" id="places" aria-labelledby="places-h">
  <div class="places-head">
    <h2 id="places-h">${assign ? `Set ${esc(slotLabel!)}` : "Where should we check?"}</h2>
    <button class="link" data-action="sheet-close" data-key="sheet-close">${assign ? "Cancel" : "Close"}</button>
  </div>
  ${
    assign
      ? ""
      : `<ul class="slots">${SLOTS.map((s) => {
          const p = state.places[s.id];
          return `<li><button class="slot-use" data-action="${p ? "use-slot" : "assign"}" data-slot="${s.id}" data-key="use-${s.id}"><b>${esc(s.label)}</b><span>${p ? esc(placeLabelOf(p)) : "Not set"}</span></button>
          <button class="btn-quiet" data-action="assign" data-slot="${s.id}" data-key="assign-${s.id}">${p ? "Change" : "Set"}</button></li>`;
        }).join("")}</ul>`
  }
  <div class="places-geo">${geoControls(assign)}</div>
  <label class="search-label" for="area-search">Pick your area</label>
  <input id="area-search" class="area-search" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Town or estate, e.g. Tampines" value="${esc(state.search)}" data-action="search" data-key="area-search"/>
  <div class="area-results" data-results>${areaResults()}</div>
  <p class="fine">The area list is built into the app. Searching sends nothing anywhere.</p>
  ${assign ? "" : `<button class="link island-link" data-action="island" data-key="island">Show Singapore (island average)</button>`}
</section>`;
}

/** First run: two equal choices, no OS prompt until the user taps (SPEC v1.4 §1). */
function firstRunCard() {
  return `<section class="first-run" aria-labelledby="fr-h">
  <h2 id="fr-h">Where should we check?</h2>
  <p>Pick one. You can change it any time, and save Home and Work/School.</p>
  <div class="fr-choices">
    <button class="fr-choice" data-action="geo-ask" data-key="fr-geo">${target}<b>Use my location</b><span>Nearest NEA station to you</span></button>
    <button class="fr-choice" data-action="fr-area" data-key="fr-area">${pin}<b>Pick my area</b><span>Search towns and estates</span></button>
  </div>
  ${state.geoExplain ? geoControls(null) : ""}
  <p class="fine">${esc(PRIVACY_LINE)} Until you choose, we show the island average.</p>
</section>`;
}

function logo() {
  // Brand mark C "Sun over haze": the dot is the reading (live band colour), the haze lines never change.
  return `<svg class="mark" width="26" height="26" viewBox="0 0 100 100" aria-hidden="true"><circle class="mark-dot" cx="50" cy="38" r="17"/><rect x="17" y="61" width="66" height="7.5" rx="3.75" fill="currentColor"/><rect x="27" y="73.5" width="46" height="7.5" rx="3.75" fill="currentColor" fill-opacity="0.7"/><rect x="38" y="86" width="24" height="7.5" rx="3.75" fill="currentColor" fill-opacity="0.45"/></svg>`;
}

function profilePanel() {
  return `<fieldset class="profile" id="profile">
  <legend>Who are you checking for?</legend>
  <p class="profile-sub">We'll give advice that fits. You can pick more than one.</p>
  <div class="profile-opts">
  ${PROFILES.map(
    (p) => `<label class="opt"><input type="checkbox" data-action="profile" data-key="p-${p.id}" value="${p.id}"${state.profile.includes(p.id) ? " checked" : ""}/><span>${esc(p.label)}</span></label>`,
  ).join("")}
  </div>
  <div class="row-actions"><button class="btn btn-solid btn-sm" data-action="profile-done" data-key="profile-done">Done</button><button class="link" data-action="profile-skip" data-key="profile-skip">Skip for now</button></div>
  <p class="fine">Saved on this device only.</p>
</fieldset>`;
}

/** COPY §10 detail lines. */
function statusDetail(s: Snapshot): string | null {
  const age = nowMs() - Date.parse(s.observedAt);
  if (offline()) return `You're offline. Showing the reading from ${formatSgtTime(s.observedAt)}.`;
  if (s.stale && !isStale(s.observedAt, nowMs())) return `NEA's stations haven't reported since ${formatSgtTime(s.observedAt)}.`;
  if (s.stale) return "Newer readings from NEA are late. We'll keep checking.";
  if (age > 75 * 60_000) return "NEA usually posts each hour at about half past. Next update soon.";
  return null;
}

function nowSection(s: Snapshot, afterShare = "") {
  const info = bandInfo(s.band);
  const v = verdict(s.band, state.profile, s.trend, { stale: s.stale, observedAt: s.observedAt, history: s.history });
  const u = uncertainty(s, point());
  const prov = provenance(s, point(), nowMs(), provOpts());
  const words = trendWords(s.history);
  const tw = trendWord(s.history);
  const acts = actions(s.band, state.profile);
  const old = s.stale;
  const detail = statusDetail(s);
  const chip = `<span class="chip${old ? " is-old" : ""}">${bandShape(info.shape, info.color, 14, { outline: old })}${esc(info.label)}${old ? " (old)" : ""}</span>`;

  return `<section class="now${offline() ? " is-offline" : ""}" aria-labelledby="verdict">
  <p class="for">${esc(v.forWhom)} · <button class="link" data-action="profile-toggle" data-key="profile-toggle" aria-expanded="${state.profileOpen}" aria-controls="profile">${
    state.profileSet ? "change" : "checking for kids or someone sensitive?"
  }</button>${offline() ? ` <span class="offline-chip">Offline</span>` : ""}</p>
  ${state.profileOpen ? profilePanel() : ""}
  <h1 id="verdict" class="verdict" aria-label="${esc(headlineLabel(s, state.profile))}">${esc(v.headline)}</h1>
  ${v.secondLine ? `<p class="second">${esc(v.secondLine)}</p>` : ""}

  <div class="reading" role="group" aria-label="${esc(`PM2.5 ${u.a11y}, ${info.label}${tw ? `, ${tw}` : ""}`)}">
    <p class="num" aria-hidden="true">${s.pm25}</p>
    <div class="num-side" aria-hidden="true">
      <span class="unit">µg/m³</span>
      <span class="unit-sub">PM2.5 · last hour</span>
      ${chip}
    </div>
  </div>
  <p class="range">${esc(uncertaintyLine(s, point(), provOpts()))}</p>
  <p class="official"><span class="official-label">${esc(officialPsiLabel(s.officialPsi24h, psiLabel))}</span> <span class="official-cap">${esc(OFFICIAL_CAPTION)}</span></p>
  <div class="share-primary"><button class="btn btn-solid" data-action="share-open" data-key="share-open">${iconShare()} Share</button></div>
  ${afterShare}
  <p class="trend">${tw ? trendIcon(s.trend.direction, "arrow") : ""}${esc(words)}</p>
  <p class="anchor">${esc(bandAnchor(s.band))}</p>

  <p class="prov">${esc(prov.text)} · <span data-age>${esc(prov.age)}</span></p>
  ${prov.note ? `<p class="flag">${esc(prov.note)}</p>` : ""}
  ${state.locNote ? `<p class="flag">${esc(state.locNote)}</p>` : ""}
  ${detail ? `<p class="flag" role="status">${esc(detail)}</p>` : ""}

  <details class="why"><summary>${esc(WHY_TWO_NUMBERS_LINK)}</summary><p>${esc(WHY_TWO_NUMBERS)}</p><p><button class="link" data-action="share-why" data-key="share-why">Share the two numbers</button></p></details>

  ${
    acts.length
      ? `<h2 class="acts-h">What helps now</h2><ul class="acts">${acts.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
      : `<p class="calm">${esc(calmLine(s.history))}</p>`
  }
  <p class="plan"><a href="${NEA_FORECAST_URL}" rel="noopener" target="_blank">${esc(PLANNING_LINE)}</a></p>
  <details class="tips"><summary>More tips</summary><ul>
    <li>Indoors is a good shield. Windows shut helps a bit. A purifier running helps a lot.</li>
    <li>Surgical masks aren't made to filter haze. N95 masks are, when they fit well.</li>
    <li>Sore throat or itchy eyes usually get better once you're out of the haze.</li>
  </ul></details>
</section>`;
}

function chartSection(s: Snapshot) {
  return `<section class="lag" aria-labelledby="lag-h">
  <h2 id="lag-h">${esc(CHART_COPY.title)}</h2>
  <figure class="chart-wrap">
    ${chartSvg(s.history)}
    <figcaption>
      <span class="legend"><span><i class="lg-bar" aria-hidden="true"></i>${esc(CHART_COPY.legendBars)}</span>
      <span><i class="lg-line" aria-hidden="true"></i>${esc(CHART_COPY.legendLine)}</span></span>
      <span class="caption">${esc(CHART_COPY.caption)}</span>
    </figcaption>
  </figure>
  <div class="row-actions">
    <button class="btn" data-action="share-clocks" data-key="share-clocks">${iconShare()} Share this chart</button>
    <a class="link" href="/how.html">How we calculate this</a>
  </div>
</section>`;
}

function regionsSection(s: Snapshot) {
  const w = state.where;
  const mine = w.kind === "region" ? w.region : w.kind === "gps" || w.kind === "area" ? s.nearestRegion : undefined;
  const rows = [...REGION_ORDER]
    .filter((n) => s.regions[n])
    .map((n) => {
      const r = s.regions[n];
      const info = r.pm25 === null ? null : bandInfo(r.pm25);
      const tag = n === mine ? (w.kind === "region" ? " (your area)" : " (nearest)") : "";
      return `<li${n === mine ? ' class="is-sel"' : ""}><button class="rrow" data-action="region" data-region="${n}" data-key="row-${n}">
        <span class="r-name">${esc(regionLabel(n))}<span class="r-tag">${tag}</span></span>
        ${
          info
            ? `<span class="r-val">${bandShape(info.shape, info.color, 13)}<b>${r.pm25}</b> <span class="r-band">${esc(info.label)}</span></span>`
            : `<span class="r-val r-off">offline</span>`
        }</button></li>`;
    })
    .join("");
  return `<section class="regions" aria-labelledby="reg-h">
  <h2 id="reg-h">Across Singapore <span class="h-sub">PM2.5 at ${esc(formatSgtTime(s.observedAt))}</span></h2>
  ${mapSvg(s, { selected: mine, point: point() })}
  <ul class="rlist">${rows}</ul>
</section>`;
}

function appsSection() {
  const w = state.where;
  const cliArg = w.kind === "area" ? `--area "${w.name}"` : w.kind === "region" ? `--region ${w.region}` : "--region central";
  const embedQ = w.kind === "area" ? `area=${encodeURIComponent(w.name)}` : w.kind === "region" ? `region=${w.region}` : "region=central";
  const embed = `<iframe src="${SITE_URL}?embed=1&${embedQ}" title="HazeNow: air right now" width="320" height="190" style="border:0;border-radius:14px;overflow:hidden" loading="lazy"></iframe>`;
  const s = state.snap;
  const badge = s ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(s))}` : "";
  const item = (name: string, sub: string, status: string, extra = "") =>
    `<li><div><p class="a-name">${name}</p><p class="a-sub">${sub}</p>${extra}</div><span class="a-status">${status}</span></li>`;
  return `<section class="apps" aria-labelledby="apps-h">
  <h2 id="apps-h">HazeNow, wherever you look</h2>
  <p class="apps-intro">Same numbers and the same rules everywhere. Free and open source.</p>
  <ul class="alist">
    ${item("Add to Home Screen", "This page works offline and installs like an app.", "Now")}
    ${item("Mac menu bar", "<code>● 105 ▲</code> next to your clock.", "Soon")}
    ${item("iPhone, iPad &amp; widgets", "Lock Screen and Home Screen widgets.", "Soon")}
    ${item("Android &amp; widgets", "Home screen widgets.", "Soon")}
    ${item(
      "Terminal",
      "For status bars, tmux and scripts.",
      `<button class="btn-quiet" data-action="copy" data-copy="${esc(`npx hazenow ${cliArg}`)}" data-key="copy-cli">Copy</button>`,
      `<pre class="snip" aria-label="Terminal command"><code>npx hazenow ${esc(cliArg)}</code></pre>`,
    )}
    ${item(
      "Embed on your site",
      "A small live card for community pages and condo portals.",
      `<button class="btn-quiet" data-action="copy" data-copy="${esc(embed)}" data-key="copy-embed">Copy</button>`,
      `<pre class="snip" aria-label="Embed code"><code>${esc(embed)}</code></pre>`,
    )}
    ${
      badge
        ? item("Badge", "A live README-style badge.", `<button class="btn-quiet" data-action="badge" data-key="badge">Download</button>`, `<img class="badge" src="${badge}" alt="HazeNow badge" height="20"/>`)
        : ""
    }
  </ul>
</section>`;
}

function footer() {
  const s = state.snap;
  return `<footer class="foot">
  <p class="status" data-status>${statusText()}</p>
  ${s ? `<p>${esc(provenance(s, point(), nowMs()).detail)}</p>` : ""}
  <p>${esc(FOOTER_LINE)}</p>
  <p>${esc(PRIVACY_LINE)}</p>
  <p><a href="/how.html">How we calculate this</a> · <a href="${REPO_URL}" rel="noopener">View the code (MIT)</a> · <button class="link" data-action="share-open" data-key="share-foot">Share</button> · <button class="link" data-action="about" data-key="about" aria-expanded="${state.aboutOpen}" aria-controls="about">Made by Yong Quan Tan</button></p>
  ${state.aboutOpen ? aboutSection() : ""}
  <p class="fine">Not medical advice, and not an official NEA app. If you feel unwell, see a doctor. In an emergency, call 995.</p>
</footer>`;
}

/** COPY §18, verbatim. */
function aboutSection() {
  return `<section class="about" id="about" aria-labelledby="about-h">
  <h2 id="about-h">About HazeNow</h2>
  <p>I built HazeNow because the number most of us check during a haze, the 24-hr PSI, moves slowly. NEA also publishes the last hour's PM2.5, and recommends it for deciding what to do right now. HazeNow puts that number first, in plain words, using only NEA's data.</p>
  <p>It's free and open source (MIT). No ads, no tracking, no account. Your location stays on your phone.</p>
  <p class="about-sig">— Yong Quan Tan</p>
  <ul class="about-links">
    <li><a href="${LINKEDIN_URL}" rel="noopener" target="_blank">LinkedIn</a></li>
    <li><a href="https://kairoslabs.sg" rel="noopener" target="_blank">Kairos Labs · kairoslabs.sg</a><br><span class="about-sub">I run Kairos Labs, an applied AI studio.</span></li>
    <li><a href="${REPO_URL}" rel="noopener" target="_blank">Source code on GitHub</a></li>
  </ul>
</section>`;
}

function statusText() {
  if (state.loading) return `<span class="dot-live is-busy" aria-hidden="true"></span>Checking for a new reading…`;
  if (!state.online) return `<span class="dot-live is-off" aria-hidden="true"></span>You're offline.`;
  if (state.error) return `<span class="dot-live is-off" aria-hidden="true"></span>Can't reach NEA's data right now. We'll try again in a few minutes.`;
  if (MOCK) return `<span class="dot-live" aria-hidden="true"></span>Mock scenario “${esc(MOCK)}”. Clock frozen at ${formatSgtTime(nowMs())}.`;
  if (state.lastChecked && state.nextCheck)
    return `<span class="dot-live" aria-hidden="true"></span>Checked ${formatSgtTime(state.lastChecked)} · next check ${formatSgtTime(state.nextCheck)}`;
  return "";
}

function iconShare() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 5l3-3 3 3M3 9v4h10V9"/></svg>`;
}

function emptyState(): string {
  if (!state.error) {
    return `<section class="now skeleton" aria-busy="true"><p class="for">&nbsp;</p><h1 class="verdict">Getting NEA's latest reading…</h1><p class="num">&nbsp;</p></section>`;
  }
  const [h, p] =
    state.error === "offline"
      ? ["Can't load the air reading", "You're offline. Connect to see NEA's latest reading."]
      : state.error === "nodata"
        ? ["No reading available", "NEA's data didn't include a usable reading this hour. We'll try again soon."]
        : ["Can't reach NEA's data right now", "We'll try again in a few minutes."];
  return `<section class="now"><h1 class="verdict">${esc(h)}</h1><p class="second">${esc(p)}</p><div class="row-actions"><button class="btn" data-action="retry" data-key="retry">Try again</button></div></section>`;
}

function ribbon() {
  return MOCK ? `<p class="mock-ribbon">MOCK DATA · ${esc(MOCK)}</p>` : "";
}

function mainView(): string {
  const s = state.snap;
  const fr = state.firstRun && !state.sheet ? firstRunCard() : "";
  if (!s) return `${header()}<main class="page"><div class="col-a">${emptyState()}${fr}</div></main>${footer()}${toastEl()}`;
  return `<div class="veil" aria-hidden="true"></div>
${header()}
<main class="page">
  <div class="col-a">${nowSection(s, fr)}</div>
  <div class="col-b">${chartSection(s)}${regionsSection(s)}</div>
  <div class="col-full">${appsSection()}</div>
</main>
${footer()}${toastEl()}`;
}

function toastEl() {
  return `<div class="toast${state.toast ? "" : " is-out"}" role="status">${esc(state.toast ?? "")}</div>`;
}

function embedView(): string {
  const s = state.snap;
  if (!s) {
    return `<main>${ribbon()}<div class="embed"><h1 class="e-verdict">${state.error ? "Can't reach NEA's data right now" : "Getting NEA's latest reading…"}</h1><p class="e-meta">HazeNow</p></div></main>`;
  }
  const info = bandInfo(s.band);
  const v = verdict(s.band, ["general"], s.trend);
  const u = uncertainty(s, point());
  const tw = trendWord(s.history);
  const w = state.where;
  const href = `${SITE_URL}?${w.kind === "area" ? `area=${encodeURIComponent(w.name)}` : `region=${w.kind === "region" ? w.region : s.nearestRegion || "central"}`}`;
  return `<main>${ribbon()}<a class="embed" href="${href}" target="_blank" rel="noopener" aria-label="${esc(`${v.short}. PM2.5 ${u.a11y}, ${info.label}${tw ? `, ${tw}` : ""}, measured ${formatSgtTime(s.observedAt)}. Open HazeNow`)}">
  <h1 class="e-verdict">${esc(v.short)}</h1>
  <p class="e-num">${s.pm25}<span>µg/m³ PM2.5</span></p>
  <p class="e-chip"><span class="chip${s.stale ? " is-old" : ""}">${bandShape(info.shape, info.color, 12, { outline: s.stale })}${esc(info.label)}${s.stale ? " (old)" : ""}</span> ${tw ? trendIcon(s.trend.direction, "e-arrow") : ""}</p>
  <p class="e-psi">NEA 24-hr PSI ${s.officialPsi24h ?? "not available"}</p>
  <p class="e-meta">${esc(placeLabelOf(state.where))} · ${esc(formatSgtTime(s.observedAt))} · NEA<span>HazeNow ↗</span></p>
</a></main>`;
}

/* ---------------------------------------------------------------- render */

let lastRenderKey = "";
let animatedOnce = false;

function applyTheme() {
  const s = state.snap;
  const root = document.documentElement;
  if (!s) return;
  const info = bandInfo(s.band);
  const h = hazeLevel(s.pm25);
  root.style.setProperty("--band", info.color);
  root.style.setProperty("--haze", h.toFixed(3));
  root.style.setProperty("--veil", `${(5 + h * 11).toFixed(1)}%`);
  root.dataset.band = s.band;
  document.title = `${s.pm25} ${info.label} · ${placeLabelOf(state.where)} · HazeNow`;
  // Announce the headline only when the band changes.
  if (!EMBED && announcedBand !== s.band) {
    if (announcedBand !== null) announcer.textContent = headlineLabel(s, state.profile);
    announcedBand = s.band;
  }
}

function render() {
  const s = state.snap;
  const key = JSON.stringify([s?.publishedAt, s?.pm25, s?.nearestRegion, s?.locationMode, s?.stale, s?.officialPsi24h, s?.history.length, state.where, state.firstRun, state.places, state.sheet, state.geoExplain, state.geoBlocked, state.profile, state.profileOpen, state.locating, state.locNote, state.error, state.fromCache, state.online, state.aboutOpen]);
  applyTheme();
  if (key === lastRenderKey) {
    renderStatus();
    return;
  }
  // The entrance animation plays once per page load, not on every place switch.
  const first = !animatedOnce && !!s;
  if (first) animatedOnce = true;
  lastRenderKey = key;
  const active = document.activeElement as HTMLElement | null;
  const focusKey = active?.dataset?.key;
  const caret = active instanceof HTMLInputElement ? active.selectionStart : null;
  app.innerHTML = EMBED ? embedView() : mainView();
  app.classList.toggle("is-first", first);
  if (focusKey) {
    const el = app.querySelector(`[data-key="${CSS.escape(focusKey)}"]`) as HTMLElement | null;
    el?.focus();
    if (el instanceof HTMLInputElement && caret !== null) el.setSelectionRange(caret, caret);
  }
}

function renderStatus() {
  const el = app.querySelector("[data-status]");
  if (el) el.innerHTML = statusText();
  const age = app.querySelector("[data-age]");
  if (age && state.snap) age.textContent = provenance(state.snap, point(), nowMs(), provOpts()).age;
}

/* ---------------------------------------------------------------- events */

function saveProfile(done: boolean) {
  state.profileSet = true;
  store.set("hn.profile", state.profile);
  store.set("hn.profileSet", true);
  if (done) state.profileOpen = false;
  render();
  if (done) (app.querySelector('[data-key="profile-toggle"]') as HTMLElement | null)?.focus();
}

function focusKey(k: string) {
  (app.querySelector(`[data-key="${k}"]`) as HTMLElement | null)?.focus();
}

app.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!el) return;
  const slot = el.dataset.slot as Slot | undefined;
  switch (el.dataset.action) {
    case "sheet":
      state.sheet = state.sheet ? null : { assign: null };
      state.search = "";
      state.geoExplain = false;
      render();
      break;
    case "sheet-close":
      state.sheet = null;
      state.geoExplain = false;
      render();
      focusKey("sheet");
      break;
    case "fr-area":
      state.sheet = { assign: null };
      render();
      focusKey("area-search");
      break;
    case "assign":
      state.sheet = { assign: slot! };
      state.search = "";
      state.geoExplain = false;
      render();
      focusKey("area-search");
      break;
    case "use-slot":
      if (slot && state.places[slot]) choose(state.places[slot]!);
      break;
    case "geo-ask":
      // Explain first; the OS prompt only follows "Continue".
      state.geoExplain = true;
      render();
      focusKey("geo-go");
      break;
    case "geo-go":
      locate((el.dataset.assign as Slot) || null);
      break;
    case "geo-cancel":
      state.geoExplain = false;
      render();
      break;
    case "pick-area": {
      const a = findArea(el.dataset.area ?? "");
      if (a) choose({ kind: "area", name: a.name, point: rounded(a) }, { assign: state.sheet?.assign ?? null });
      break;
    }
    case "island":
      choose({ kind: "island" });
      break;
    case "region":
      choose({ kind: "region", region: el.dataset.region! });
      break;
    case "profile-toggle":
      state.profileOpen = !state.profileOpen;
      render();
      if (state.profileOpen) (app.querySelector("#profile input") as HTMLElement | null)?.focus();
      break;
    case "profile-done":
      saveProfile(true);
      break;
    case "profile-skip":
      state.profile = ["general"];
      saveProfile(true);
      break;
    case "share-open":
      openShare();
      break;
    case "share-clocks":
      openShare({ initial: "clocks" });
      break;
    case "share-why":
      openShare({ fromWhy: true });
      break;
    case "about":
      state.aboutOpen = !state.aboutOpen;
      render();
      if (state.aboutOpen) document.getElementById("about")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      break;
    case "copy":
      copy(el.dataset.copy ?? "", "Copied.");
      break;
    case "badge":
      if (state.snap) download(new Blob([badgeSvg(state.snap)], { type: "image/svg+xml" }), "hazenow-badge.svg");
      break;
    case "retry":
      refresh();
      break;
  }
});

app.addEventListener("keydown", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[role="button"][data-action]');
  if (el && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  const input = e.target as HTMLElement;
  if (input.dataset?.action === "search" && e.key === "Enter") {
    e.preventDefault();
    const first = searchAreas(state.search, 1)[0];
    if (first) choose({ kind: "area", name: first.name, point: rounded(first) }, { assign: state.sheet?.assign ?? null });
  }
  if (e.key === "Escape" && state.sheet) {
    state.sheet = null;
    render();
    focusKey("sheet");
  }
});

app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.action !== "search") return;
  state.search = el.value;
  // Update only the results so typing never loses focus.
  const box = app.querySelector("[data-results]");
  if (box) box.innerHTML = areaResults();
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.action === "profile" && el instanceof HTMLInputElement) {
    let picked = [...app.querySelectorAll<HTMLInputElement>('input[data-action="profile"]:checked')].map((i) => i.value as Profile);
    // "Just me, generally healthy" can't be combined with a sensitive option (COPY §1).
    if (el.value === "general" && el.checked) picked = picked.filter((p) => !PROFILES.find((x) => x.id === p)?.sensitive);
    state.profile = normaliseProfile(picked);
    saveProfile(false);
  }
});

window.addEventListener("online", () => {
  state.online = true;
  refresh();
});
window.addEventListener("offline", () => {
  state.online = false;
  render();
});
document.addEventListener("visibilitychange", () => {
  if (!MOCK && document.visibilityState === "visible" && state.nextCheck && Date.now() >= state.nextCheck - 5_000) refresh();
});
setInterval(() => {
  if (!state.snap) return;
  const was = state.snap.stale;
  state.snap = refreshStale(state.snap, nowMs());
  if (state.snap.stale !== was) render();
  else renderStatus();
}, 60_000);

/* ---------------------------------------------------------------- boot */

{
  const cached = cacheGet();
  if (cached) {
    // Paint instantly from the device cache; the live fetch replaces it in a moment.
    state.snap = refreshStale(cached, nowMs());
    state.fromCache = true;
  }
  render();
  refresh();
  refreshGrantedLocation();
}

// Register right away (not on "load") so the precache is in place as early as possible.
if (import.meta.env.PROD && "serviceWorker" in navigator && !EMBED && !MOCK) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
