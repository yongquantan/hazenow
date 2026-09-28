/**
 * SPEC v2.0 — Southeast Asia on the web. Singapore never goes through this file: its v1 page in main.ts is untouched.
 *
 * Data modes (per city, see sea.cityMode):
 * - live: Thailand direct from Air4Thai (CORS *), or MY/ID/VN/PH/LA through the proxy when VITE_PROXY_URL is set.
 * - preview: proxied countries with no proxy → the recorded 28 Sep 2026 captures, clearly ribboned, never shared.
 * - unavailable: needs permission / not feasible → a calm "Not available yet" with COVERAGE.md's reason.
 * Location never leaves the device: TH fetches the station list, proxied countries fetch /v1/{cc}/observations,
 * and the snapshot is built here.
 */
import { calmLine, sea, trendWord, trendWords, type LatLon, type Profile } from "hazenow";
import { chartSvg } from "./chart";
import { bandShape, esc, trendIcon } from "./util";

type CountryCode = import("hazenow").sea.CountryCode;
type CountrySnapshot = import("hazenow").sea.CountrySnapshot;
type CityPlace = import("hazenow").sea.CityPlace;
export type DataMode = import("hazenow").sea.DataMode;
export { sea };

/** Base URL of services/proxy (HAZENOW_EDGE). Unset → proxied countries run in Preview. */
export const PROXY_URL: string | null = ((import.meta.env.VITE_PROXY_URL as string | undefined) ?? "").trim() || null;

/** A place outside Singapore: a catalogue city, or a GPS point resolved to a country. */
export interface CityWhere {
  kind: "city";
  country: CountryCode;
  /** Catalogue slug ("bangkok"), or "" for a GPS point. */
  id: string;
  name: string;
  point: LatLon;
  gps?: boolean;
}

export const COUNTRY_NAME = (cc: CountryCode) => sea.COUNTRIES[cc].name;
/** "the Philippines" in running text. */
const COUNTRY_IN = (cc: CountryCode) => (cc === "PH" ? "the Philippines" : COUNTRY_NAME(cc));
/** "Malaysia's", "the Philippines'". */
const COUNTRY_POSS = (cc: CountryCode) => {
  const n = COUNTRY_IN(cc);
  return n.endsWith("s") ? `${n}'` : `${n}'s`;
};
export const viewerOffset = () => -new Date().getTimezoneOffset() / 60;

export function cityWhere(c: CityPlace): CityWhere {
  return { kind: "city", country: c.country, id: c.id, name: c.name, point: { lat: c.lat, lon: c.lon } };
}

/** Nearest catalogue city in the same country (for a GPS point's name and coverage status). */
export function nearestCity(cc: CountryCode, p: LatLon): CityPlace {
  const list = sea.citiesOf(cc);
  let best = list[0];
  let bd = Infinity;
  for (const c of list) {
    const d = (c.lat - p.lat) ** 2 + ((c.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** The catalogue entry that decides this place's coverage: itself, or (GPS) the nearest city in its country. */
export function cityOf(w: CityWhere): CityPlace {
  return (w.id && sea.findCity(w.id, w.country)) || nearestCity(w.country, w.point);
}

export function modeOf(w: CityWhere): DataMode {
  return sea.cityMode(cityOf(w), !!PROXY_URL);
}

/** Deep link: ?country=th&area=bangkok (area optional → the country's default city). SG is handled by main.ts. */
export function cityFromParams(params: URLSearchParams): CityWhere | null {
  const raw = (params.get("country") ?? "").toUpperCase();
  if (!raw || raw === "SG" || !sea.isCountryCode(raw)) return null;
  const cc = raw as CountryCode;
  const area = params.get("area");
  const c = (area && sea.findCity(area, cc)) || sea.defaultCity(cc);
  return cityWhere(c);
}

/* ---------------------------------------------------------------- data */

const previewFiles = import.meta.glob<import("hazenow").sea.ObservationSet>("../../../packages/core/fixtures/sea/preview/*.json", { import: "default" });

export class CountryUnavailable extends Error {
  constructor() {
    super("not available");
    this.name = "CountryUnavailable";
  }
}

export interface CountryLoad {
  snap: CountrySnapshot;
  mode: DataMode;
}

/** Fetch (or load the recorded preview) and build the snapshot on the device. */
export async function loadCountry(w: CityWhere, signal?: AbortSignal): Promise<CountryLoad> {
  const mode = modeOf(w);
  if (mode === "unavailable") throw new CountryUnavailable();
  // A picked destination gets its hard radius (sea.placeQuery): a far station is never stretched to cover it.
  const picked = !w.gps && w.id ? sea.findCity(w.id, w.country) : null;
  const q = picked ? { ...sea.placeQuery(picked), lat: w.point.lat, lon: w.point.lon } : { lat: w.point.lat, lon: w.point.lon };
  if (mode === "preview") {
    const load = previewFiles[`../../../packages/core/fixtures/sea/preview/${w.country.toLowerCase()}.json`];
    if (!load) throw new CountryUnavailable();
    const set = await load();
    return { snap: sea.buildCountrySnapshot(set, q, Date.parse(sea.PREVIEW_CAPTURED_AT)), mode };
  }
  const adapter = sea.getAdapter(w.country);
  if (!adapter) throw new CountryUnavailable();
  const snap = await adapter.getSnapshot(q, { signal, near: { lat: q.lat, lon: q.lon }, proxyBase: PROXY_URL ?? undefined });
  return { snap, mode };
}

/**
 * Next poll (SPEC v2.0 §8). TH: from hh:02 local every 2 min until the new hour lands (stop at hh:30), else at the
 * next hh:02. Proxied: every 5 min. Preview: never.
 */
export function nextPollMs(w: CityWhere, mode: DataMode, observedAt: string | undefined, now = Date.now()): number | null {
  if (mode !== "live") return null;
  if (w.country !== "TH") return 5 * 60_000;
  const off = sea.COUNTRIES.TH.utcOffset * 3600_000;
  const local = now + off;
  const min = Math.floor((local % 3600_000) / 60_000);
  const hourStart = local - (local % 3600_000) - off; // UTC ms of this local hour's start
  const have = observedAt ? Date.parse(observedAt) >= hourStart : false;
  if (!have && min >= 2 && min < 30) return 2 * 60_000;
  const next = hourStart + 3600_000 + 2 * 60_000;
  return Math.max(60_000, next - now);
}

/* ---------------------------------------------------------------- views */

const NEUTRAL = "#8FA3AD";

/** Chip: English word, the authority's own word small beside it, then the agency (SPEC v2.0 §5). */
export function chipHtml(c: import("hazenow").sea.ChipModel, old = false, size = 14): string {
  return `<span class="chip chip-sea${old ? " is-old" : ""}" style="--chip:${esc(c.color)}">${bandShape(c.shape, c.color, size, { outline: old })}${esc(c.en)}${
    c.local ? ` <span class="chip-local" lang="${esc(c.lang)}">${esc(c.local)}</span>` : ""
  }${old ? " (old)" : ""}</span>`;
}

export function officialHtml(o: import("hazenow").sea.OfficialRowModel, explainer: string | null): string {
  const word = o.en ?? o.local;
  return `<p class="official"><span class="official-label">${esc(o.label)}: ${o.value}${word ? ` · ${esc(word)}` : ""}</span>${
    o.en && o.local ? ` <span class="official-local" lang="${esc(o.lang)}">${esc(o.local)}</span>` : ""
  }</p>${explainer ? `<p class="official-note">${esc(explainer)}</p>` : ""}`;
}

export interface CountryViewCtx {
  w: CityWhere;
  s: CountrySnapshot;
  mode: DataMode;
  profile: Profile[];
  profileSet: boolean;
  profileOpen: boolean;
  profilePanel: () => string;
  shareIcon: string;
  now: number;
  offline: boolean;
  locNote: string | null;
}

function ageText(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} hr${h === 1 ? "" : "s"} ago` : `${Math.floor(h / 24)} days ago`;
}

export function countryNowHtml(x: CountryViewCtx): string {
  const { s, w } = x;
  const city = cityOf(w);
  const placeName = w.gps ? `near ${city.name}` : w.name;
  const d = sea.countryDisplay(s, { placeName: w.gps ? city.name : w.name, viewerOffsetHours: viewerOffset(), lon: w.point.lon });
  const v = sea.countryVerdict(s, x.profile);
  const tw = s.pm25 !== null ? trendWord(s.history) : null;
  // Actions follow the authority's advice for the chip's category (never SG's bands).
  const ab = sea.adviceBand(s);
  const acts = sea.countryActions(s, x.profile);
  const old = s.stale;
  const preview = x.mode === "preview";
  const canShare = x.mode === "live" && s.pm25 !== null;
  const reading =
    s.pm25 !== null
      ? `<div class="reading" role="group" aria-label="${esc(`PM2.5 ${s.pm25} micrograms per cubic metre${d.chip ? `, ${d.chip.en} (${d.chip.agency})` : ""}${tw ? `, ${tw}` : ""}`)}">
    <p class="num" aria-hidden="true">${s.pm25}</p>
    <div class="num-side" aria-hidden="true">
      <span class="unit">µg/m³</span>
      <span class="unit-sub">${esc(d.numberSub)}</span>
      ${d.chip ? chipHtml(d.chip, old) : ""}
    </div>
  </div>
  ${d.chip ? `<p class="chip-note">${esc(d.chip.basisNote)}</p>` : ""}`
      : `<div class="no-number" role="group" aria-label="${esc(d.noNumber?.title ?? "")}">
    <p class="nn-title">${esc(d.noNumber?.title ?? "")}</p>
    ${d.chip ? `<p class="nn-chip">${chipHtml(d.chip, old)}</p>` : ""}
    <p class="nn-line">${esc(d.noNumber?.line ?? "")}</p>
  </div>
  ${d.sensorLine ? `<p class="sensor-line">${esc(d.sensorLine)} <span class="sensor-note">It's a community sensor, not an official reading.</span></p>` : ""}`;
  const kind = d.kindLabel
    ? `<p class="range"><span class="kind kind-${s.pm25Kind === "crowd_estimate" ? "crowd" : "official"}">${esc(d.kindLabel)}</span>${
        s.range ? ` · range ${s.range[0]}–${s.range[1]}` : ""
      }</p>`
    : "";
  const thaiNote =
    s.country === "TH" && s.localBand
      ? `<p class="fine sea-draft">Advice follows PCD's guidance for each Thai AQI category. Wording is a draft, awaiting native review.</p>`
      : s.localBand && v.needsReview
        ? `<p class="fine sea-draft">Advice follows ${esc(s.localBand.agency)}'s guidance for each category. Wording is a draft, awaiting native review.</p>`
        : "";
  return `<section class="now sea-now${x.offline ? " is-offline" : ""}" aria-labelledby="verdict">
  ${preview ? `<p class="preview-ribbon" role="note">${esc(sea.previewRibbon(s, viewerOffset(), w.point.lon))}</p>` : ""}
  <p class="for">${esc(v.forWhom)} · <button class="link" data-action="profile-toggle" data-key="profile-toggle" aria-expanded="${x.profileOpen}" aria-controls="profile">${
    x.profileSet ? "change" : "checking for kids or someone sensitive?"
  }</button>${x.offline ? ` <span class="offline-chip">Offline</span>` : ""}</p>
  ${x.profileOpen ? x.profilePanel() : ""}
  <h1 id="verdict" class="verdict${v.hedged ? " is-hedged" : ""}">${esc(v.headline)}</h1>
  ${v.secondLine && !(d.whoLine && v.secondLine === d.whoLine) ? `<p class="second">${esc(v.secondLine)}</p>` : ""}
  ${reading}
  ${kind}
  ${d.whoLine ? `<p class="who-line">${esc(d.whoLine)} <span class="official-cap">WHO 2021, 15 µg/m³ over 24 hours</span></p>` : ""}
  ${d.official ? officialHtml(d.official, d.officialExplainer) : ""}
  <div class="share-primary">${
    canShare
      ? `<button class="btn btn-solid" data-action="share-open" data-key="share-open">${x.shareIcon} Share</button>`
      : `<button class="btn btn-solid" disabled aria-describedby="share-why-off">${x.shareIcon} Share</button><p class="fine share-off" id="share-why-off">${
          preview ? "Sharing turns on when this is live data, so a recorded reading never passes as today's." : "Sharing needs an hourly reading."
        }</p>`
  }</div>
  ${s.pm25 !== null && tw ? `<p class="trend">${trendIcon(s.trend.direction, "arrow")}${esc(trendWords(s.history))}</p>` : ""}

  ${d.provenance ? `<p class="prov">${esc(tidyStation(s.range && d.kindLabel ? d.provenance.replace(/ · range \d+–\d+/, "") : d.provenance))} · <span>${esc(preview ? "recorded" : ageText(s.observedAt, x.now))}</span></p>` : ""}
  ${x.locNote ? `<p class="flag">${esc(x.locNote)}</p>` : ""}
  ${old && !preview ? `<p class="flag" role="status">${esc(`${sea.mainAgency(s)} hasn't posted a newer reading. This one is from ${sea.stationTime(s.observedAt, s.country, viewerOffset(), w.point.lon)}.`)}</p>` : ""}
  ${s.notes.includes("nearest_far") ? `<p class="flag">The nearest official station is far from ${esc(placeName)}, so treat this as a rough guide.</p>` : ""}

  ${
    acts.length
      ? `<h2 class="acts-h">What helps now</h2><ul class="acts">${acts.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
      : ab === "normal" && s.pm25 !== null && (s.bandBasis === "pm25_1h" || s.pm25 <= 25) && !officialStricter(s)
        ? `<p class="calm">${esc(calmLine(s.history))}</p>`
        : ""
  }
  ${thaiNote}
</section>`;
}

/** The published (24-hr) index sits in a stricter category than the chip (e.g. Jakarta: hour Sedang, ISPU Tidak Sehat). */
function officialStricter(s: CountrySnapshot): boolean {
  if (!s.official || !s.localBand || s.bandBasis === "official_index") return false;
  try {
    const lvl = sea.classifyIndex(s.official.scaleId, s.official.value)?.level;
    return lvl != null && lvl > s.localBand.level;
  } catch {
    return false;
  }
}

export function countryChartHtml(s: CountrySnapshot, lon: number): string {
  if (s.pm25 === null || s.history.length < 2) return "";
  const b = s.localBand;
  const byHour = b && s.bandBasis === "pm25_1h";
  const color = (v: number) => (byHour ? sea.classifyPm25(b!.scaleId, v)?.color ?? NEUTRAL : NEUTRAL);
  const time = (iso: string) => sea.stationTime(iso, s.country, undefined, lon);
  const agency = sea.mainAgency(s);
  const hasLine = s.history.filter((h) => typeof h.pm25Avg24h === "number").length >= 2;
  const bars = s.pm25Kind === "crowd_estimate" ? "Bars: hourly PM2.5, community-sensor estimate" : "Bars: hourly PM2.5 at your spot";
  return `<section class="lag" aria-labelledby="lag-h">
  <h2 id="lag-h">Last 24 hours</h2>
  <figure class="chart-wrap">
    ${chartSvg(s.history, { floor: 60, color, guides: [{ v: 15, label: "WHO 24-hr 15" }], time, lineName: `${agency}'s 24-hr average PM2.5` })}
    <figcaption>
      <span class="legend"><span><i class="lg-bar" aria-hidden="true" style="background:${byHour ? "var(--band)" : NEUTRAL}"></i>${esc(bars)}</span>
      ${hasLine ? `<span><i class="lg-line" aria-hidden="true"></i>${esc(`Line: ${agency} 24-hr average PM2.5`)}</span>` : ""}</span>
      <span class="caption">${esc(hasLine ? "The line moves slowly because it averages a whole day. The bars show each hour." : "The bars show each hour. The dashed line is the WHO 24-hour guideline.")}</span>
    </figcaption>
  </figure>
</section>`;
}

/** Nearby stations/sensors from the same country only (never across a border). */
export function stationsHtml(s: CountrySnapshot, w: CityWhere): string {
  // Same country only (the builder guarantees it) and within the builder's furthest official radius.
  const rows = s.stations.filter((r) => r.distanceKm === null || r.distanceKm <= sea.OFFICIAL_MAX_KM).slice(0, 6);
  if (!rows.length) return "";
  const off = viewerOffset();
  const kmTxt = (d: number | null) => (d === null ? "" : d < 0.1 ? "under 0.1 km" : d < 10 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`);
  return `<section class="regions sea-stations" aria-labelledby="st-h">
  <h2 id="st-h">Nearby in ${esc(COUNTRY_IN(s.country))} <span class="h-sub">${esc(sea.stationTime(s.observedAt, s.country, off, w.point.lon))}</span></h2>
  <ul class="rlist">${rows
    .map((r) => {
      const v = r.pm25_1h !== null ? `<b>${Math.round(r.pm25_1h)}</b> <span class="r-band">µg/m³</span>` : r.official ? `<b>${r.official.value}</b> <span class="r-band">${esc(r.official.name)}</span>` : `<span class="r-off">no reading</span>`;
      return `<li><div class="rrow"><span class="r-name">${esc(tidyName(r.name))}<span class="r-tag"> · ${esc(kmTxt(r.distanceKm))}${r.grade === "lowcost" ? " · sensor" : ""}</span></span><span class="r-val">${v}</span></div></li>`;
    })
    .join("")}</ul>
  <p class="fine">Only ${esc(COUNTRY_POSS(s.country))} own stations and sensors are used here, never readings from across a border.</p>
</section>`;
}

/** Provenance lines carry the raw station name ("Larkin, JOHOR · 0.6 km"). */
function tidyStation(p: string): string {
  return p.replace(/^([^·]+)/, (seg) => tidyName(seg.trimEnd()) + (seg.endsWith(" ") ? " " : ""));
}

/** "Cheras, W.P. KUALA LUMPUR" → "Cheras, W.P. Kuala Lumpur" (DOE upper-cases state names). */
function tidyName(raw: string): string {
  const n = raw.replace(/\s*\([^)]{20,}\)/g, "");
  const i = n.lastIndexOf(", ");
  if (i < 0) return n;
  return n.slice(0, i + 2) + n.slice(i + 2).replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, a: string, b: string) => a + b.toLowerCase());
}

export function attributionHtml(s: CountrySnapshot): string {
  return `<p class="sea-attrib">${s.attribution
    .map((a) => `<a href="${esc(a.url)}" rel="noopener" target="_blank">${esc(a.text)}</a>${a.shareAlike && !/CC BY-SA/.test(a.text) ? " (CC BY-SA 4.0)" : ""}`)
    .join(" · ")}</p>`;
}

export function unavailableHtml(w: CityWhere): string {
  const c = cityOf(w);
  const na = sea.notAvailable(c);
  // The nearest few places in the same country that do have data (never across a border).
  const d2 = (x: CityPlace) => (x.lat - c.lat) ** 2 + ((x.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180)) ** 2;
  const others = sea
    .citiesOf(c.country)
    .filter((x) => x.id !== c.id && sea.cityMode(x, !!PROXY_URL) !== "unavailable")
    .filter((x) => d2(x) <= 1.35 ** 2) // within ~150 km: a nearby alternative, not the other end of the country
    .sort((a, b) => d2(a) - d2(b))
    .slice(0, 4);
  return `<section class="now sea-na" aria-labelledby="verdict">
  <p class="for">${esc(w.gps ? `Near ${c.name}` : c.name)}, ${esc(COUNTRY_NAME(c.country))}</p>
  <h1 id="verdict" class="verdict">${esc(na.headline)}</h1>
  <p class="na-reason">${esc(na.reason)}</p>
  ${c.reason ? "" : `<p class="na-detail">${esc(na.detail)}</p>`}
  ${na.fix ? `<p class="na-detail na-fix">What would fix it: ${esc(na.fix)}</p>` : ""}
  ${
    others.length
      ? `<p class="na-alt">Nearby with data: ${others
          .map((o) => `<button class="link" data-action="pick-city" data-cc="${o.country}" data-city="${esc(o.id)}" data-key="alt-${esc(o.id)}">${esc(o.name)}</button>`)
          .join(", ")}</p>`
      : ""
  }
  <p class="fine na-fine">We'd rather show nothing than a number we can't stand behind.</p>
  <div class="row-actions"><button class="btn" data-action="sheet" data-key="na-pick">Pick another place</button></div>
</section>`;
}

export function noDataHtml(w: CityWhere, error: string | null): string {
  const [h, p] =
    error === "offline"
      ? ["Can't load the air reading", "You're offline. Connect to see the latest reading."]
      : error === "nodata"
        ? ["No reading near here right now", "There's no official station or community sensor close enough for an honest number."]
        : error
          ? ["Can't reach the data right now", "We'll try again in a few minutes."]
          : [`Getting the latest reading for ${w.name}…`, ""];
  return `<section class="now${error ? "" : " skeleton"}"${error ? "" : ' aria-busy="true"'}><p class="for">&nbsp;</p><h1 class="verdict">${esc(h)}</h1>${
    p ? `<p class="second">${esc(p)}</p>` : ""
  }${error && error !== "nodata" ? `<div class="row-actions"><button class="btn" data-action="retry" data-key="retry">Try again</button></div>` : ""}</section>`;
}

/* ---------------------------------------------------------------- picker (place sheet) */

import { PICKER_LITE } from "./country-lite";
if (import.meta.env.DEV && PICKER_LITE.map(([cc]) => cc).join() !== sea.PICKER_COUNTRIES.join()) console.warn("[hazenow] PICKER_LITE is out of date");

const STATUS_TAG: Record<DataMode, string> = { live: "Live", preview: "Preview", unavailable: "Not available yet" };

export function countryTabsHtml(selected: CountryCode): string {
  return `<div class="country-tabs" role="group" aria-label="Country">${sea.PICKER_COUNTRIES.map(
    (cc) =>
      `<button class="chip-btn${cc === selected ? " is-on" : ""}" data-action="sheet-country" data-cc="${cc}" data-key="cc-${cc}" aria-pressed="${cc === selected}">${esc(COUNTRY_NAME(cc))}</button>`,
  ).join("")}</div>`;
}

/** Region shown beside a name, unless the name already says it ("Penang", "Kuta (Lombok)"). */
const regionOf = (c: CityPlace) => (c.region && !c.name.includes(c.region) ? c.region : "");

function cityRow(c: CityPlace, current: CityWhere | null, extra = ""): string {
  const m = sea.cityMode(c, !!PROXY_URL);
  const on = current && !current.gps && current.country === c.country && current.id === c.id;
  const sub = extra || regionOf(c);
  return `<li><button class="area-row${on ? " is-sel" : ""}" data-action="pick-city" data-cc="${c.country}" data-city="${esc(c.id)}" data-key="city-${c.country}-${esc(c.id)}"><span class="city-name">${esc(c.name)}${
    sub ? `<span class="area-alias">${esc(sub)}</span>` : ""
  }</span> <span class="city-tag tag-${m}">${esc(STATUS_TAG[m])}</span></button></li>`;
}

export function cityListHtml(cc: CountryCode, current: CityWhere | null, search = ""): string {
  const note =
    cc === "TH"
      ? "Live from PCD's Air4Thai."
      : sea.COUNTRIES[cc].status === "needs_proxy"
        ? PROXY_URL
          ? "Live through the HazeNow server."
          : "Preview: recorded data from 28 Sep. Live once our server is up."
        : "No reliable public source yet.";
  const { popular, others } = sea.placeGroups(cc);
  const group = (title: string, id: string, list: CityPlace[]) =>
    list.length
      ? `<h3 class="city-group" id="${id}">${esc(title)}</h3><ul class="area-list city-list" role="list" aria-labelledby="${id}">${list.map((c) => cityRow(c, current)).join("")}</ul>`
      : "";
  return `<label class="search-label" for="place-search">Search places</label>
  <input id="place-search" class="area-search" type="search" inputmode="search" autocomplete="off" spellcheck="false" placeholder="Town or island, e.g. Bali, Penang, KL" value="${esc(search)}" data-action="place-search" data-key="place-search"/>
  <div data-place-results>${search.trim() ? placeResultsHtml(search, current) : ""}</div>
  <p class="fine city-note">${esc(note)}</p>${group("Popular", `pop-${cc}`, popular)}${group(popular.length ? "Other cities" : "Cities", `oth-${cc}`, others)}`;
}

/** Search results across every country (names, aliases like "Bali" or "KL", and islands). Empty query → "". */
export function placeResultsHtml(query: string, current: CityWhere | null, limit = 10): string {
  if (!query.trim()) return "";
  const hits = sea.searchPlaces(query, limit);
  if (!hits.length) return `<p class="fine">No match. Try a city or island like “Bali” or “Penang”.</p>`;
  return `<ul class="area-list city-list" role="list" aria-label="Search results">${hits
    .map((h) => {
      const alias = h.matched && h.matched !== h.place.region && !h.place.name.includes(h.matched) ? h.matched : regionOf(h.place);
      return cityRow(h.place, current, [alias, COUNTRY_NAME(h.place.country)].filter(Boolean).join(", "));
    })
    .join("")}</ul>`;
}

/** First search hit (Enter in the search box). */
export function firstPlaceHit(query: string): CityPlace | null {
  return sea.searchPlaces(query, 1)[0]?.place ?? null;
}

/** Share: the Now card only, live data only (preview/no-number disable the button). */
export function countryShareCard(w: CityWhere, s: CountrySnapshot, profile: Profile[]) {
  const city = cityOf(w);
  const name = w.gps ? city.name : w.name;
  return {
    content: sea.countryNowCard(s, name, profile, w.point.lon),
    text: sea.countryShareText(s, name, "hazenow.pages.dev", w.point.lon),
    placeName: name,
    link: `https://hazenow.pages.dev/?country=${w.country.toLowerCase()}&area=${encodeURIComponent(city.id)}&s=now`,
  };
}
