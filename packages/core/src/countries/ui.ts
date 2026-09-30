/**
 * Display model for a CountrySnapshot (SPEC v2.0 §4–§6, §9): every string a client needs outside Singapore, pure.
 * Singapore keeps its v1 UI (COPY.md); this is only used for the other countries.
 *
 * UI language is English. The authority's own word is carried beside the English (small), never instead of it.
 */
import { formatSgtTime } from "../format.js";
import { STALE_AFTER_MS } from "../constants.js";
import { trendWord, type Profile } from "../experience.js";
import { CREDIT, trendDetail, type NowCard, type PreviewCard } from "../share.js";
import { CHIP_SCALE, classifyIndex, classifyPm25, getScale } from "./scales.js";
import { COUNTRIES } from "./registry.js";
import { msToIso } from "./time.js";
import { countryVerdict, formatLocalTime, NO_SCALE_COPY, whoVerdictBand } from "./verdicts.js";
import { NOT_AVAILABLE_COPY, type CityPlace } from "./places.js";
import type { CountryCode, CountrySnapshot, LocalBand } from "./types.js";

/* ------------------------------------------------------------------ data mode */

/**
 * How a city can be shown right now:
 * - "live": direct from the authority (SG, TH), or through the proxy when one is configured.
 * - "preview": proxied country with no proxy configured → recorded fixtures (never presented or shared as live).
 * - "unavailable": needs permission / not feasible (COVERAGE.md) → calm "Not available yet" with the reason.
 */
export type DataMode = "live" | "preview" | "unavailable";

export function cityMode(c: Pick<CityPlace, "status">, proxyConfigured: boolean): DataMode {
  if (c.status === "live_direct") return "live";
  if (c.status === "needs_proxy") return proxyConfigured ? "live" : "preview";
  return "unavailable";
}

/** When the recorded preview data was captured (fixtures/sea, 2026-09-28 ~10:30 UTC). Snapshots are built at this instant. */
export const PREVIEW_CAPTURED_AT = "2026-09-28T10:30:00Z";

/** Calm "Not available yet" state for needs-permission / not-feasible places, with what would fix it when known. */
export function notAvailable(c: CityPlace): { headline: string; reason: string; detail: string; fix: string | null } {
  const detail = c.status === "needs_permission" ? NOT_AVAILABLE_COPY.needs_permission : NOT_AVAILABLE_COPY.not_feasible;
  return { headline: NOT_AVAILABLE_COPY.headline, reason: c.reason ?? detail, detail, fix: c.fix ?? null };
}

/* ------------------------------------------------------------------ time */

/** Zone abbreviation for a UTC offset in a given country (ID has three). */
export function zoneLabel(offsetHours: number, cc: CountryCode): string {
  if (cc === "ID") return offsetHours === 7 ? "WIB" : offsetHours === 8 ? "WITA" : offsetHours === 9 ? "WIT" : `UTC+${offsetHours}`;
  const byCc: Partial<Record<CountryCode, [number, string]>> = {
    SG: [8, "SGT"], TH: [7, "ICT"], VN: [7, "ICT"], LA: [7, "ICT"], KH: [7, "ICT"], MY: [8, "MYT"], PH: [8, "PHT"], BN: [8, "BNT"], MM: [6.5, "MMT"], TL: [9, "TLT"],
  };
  const z = byCc[cc];
  if (z && z[0] === offsetHours) return z[1];
  const h = Math.trunc(offsetHours);
  const m = Math.round(Math.abs(offsetHours - h) * 60);
  return `UTC${offsetHours >= 0 ? "+" : "-"}${Math.abs(h)}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** Local UTC offset for a place. Indonesia has three zones (WIB west of ~114.5°E, WITA to ~127°E, WIT beyond). */
export function localOffsetHours(cc: CountryCode, lon?: number): number {
  if (cc === "ID" && typeof lon === "number") return lon < 114.5 ? 7 : lon < 127 ? 8 : 9;
  return COUNTRIES[cc].utcOffset;
}

/** Offset (hours) written in an ISO timestamp, e.g. "+07:00" → 7, "Z" → 0. */
export function isoOffsetHours(iso: string): number | null {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return iso.endsWith("Z") ? 0 : null;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60);
}

/**
 * The timestamp re-expressed in the place's local time. Crowd sensors report in UTC ("…Z"); officials carry their
 * station's own offset, which is kept as-is.
 */
export function toLocalIso(iso: string, cc: CountryCode, lon?: number): string {
  const off = isoOffsetHours(iso);
  if (off !== null && off !== 0) return iso;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? msToIso(ms, localOffsetHours(cc, lon)) : iso;
}

/**
 * "5pm" in the station's own local time, with its zone when it differs from the viewer's
 * (SPEC v2.0 §3.4): "5pm ICT" for a Singapore viewer looking at Bangkok.
 */
export function stationTime(iso: string, cc: CountryCode, viewerOffsetHours?: number, lon?: number): string {
  const local = toLocalIso(iso, cc, lon);
  const off = isoOffsetHours(local);
  const t = off === 8 && cc === "SG" ? formatSgtTime(local) : formatLocalTime(local);
  if (off === null || viewerOffsetHours === undefined || off === viewerOffsetHours) return t;
  return `${t} ${zoneLabel(off, cc)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Mon 28 Sep, 5pm ICT" in the station's own time (share cards print absolute times with the zone). */
export function stationDateTime(iso: string, cc: CountryCode, lon?: number): string {
  const local = toLocalIso(iso, cc, lon);
  const off = isoOffsetHours(local) ?? COUNTRIES[cc].utcOffset;
  const d = new Date(Date.parse(local) + off * 3600_000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${formatLocalTime(local)} ${zoneLabel(off, cc)}`;
}

/* ------------------------------------------------------------------ display model */

export interface ChipModel {
  /** English category word ("Moderate"). */
  en: string;
  /** Authority's own word, shown small beside the English; null when it's the same word. */
  local: string | null;
  lang: string;
  agency: string;
  color: string;
  shape: LocalBand["shape"];
  /** "PCD category for the 24-hr Thai AQI" / "BMKG category for this hour's PM2.5" */
  basisNote: string;
  /** The category is for a community-sensor estimate (or WHO guidance), not an official number: show a small "estimate" tag. */
  estimate: boolean;
}

export interface OfficialRowModel {
  /** "PCD Thai AQI (24-hr)" */
  label: string;
  value: number;
  /** English category word, or null when the scale doesn't name it. */
  en: string | null;
  /** Authority's word (local language), null when the same as `en` or unknown. */
  local: string | null;
  lang: string;
  /** English-only one-liner: "PCD Thai AQI (24-hr): 78 · Moderate". */
  text: string;
}

export interface CountryDisplay {
  chip: ChipModel | null;
  /** Small label under the unit: "PM2.5 · last hour" / "PM2.5 · community sensors". */
  numberSub: string;
  /** "Official reading" or "Community sensors · estimate". Never present a crowd estimate as the authority's number. */
  kindLabel: string | null;
  /** "Measured at Phra Nakhon station · 0.9 km · 5pm ICT" / "Estimate from 4 community sensors · not a government reading · range 60–80 · 6:26pm" */
  provenance: string | null;
  /** SPEC §6 official row (English words + the local word), or null (hide). */
  official: OfficialRowModel | null;
  officialExplainer: string | null;
  /** Calm "no official hourly reading here" state: title + one-line explanation. Null when there is a number. */
  noNumber: { title: string; line: string } | null;
  /** "3.1× the WHO daily guideline." when there is no national scale. */
  whoLine: string | null;
  /**
   * 24-hr-index-only places: an in-country community sensor within 20 km reads a worse category right now.
   * "A community sensor nearby reads 104 µg/m³ right now." Shown as its own calm line, never blended into the index.
   */
  sensorLine: string | null;
  /**
   * Calm one-line notes, in order: no official anchor for a community estimate, a station left out as implausible,
   * a nearby station offline for over a day. Empty when there's nothing to say.
   */
  notices: string[];
  attribution: { text: string; url: string }[];
}

/** "Thailand's official data", "the Philippines' official data". */
export function officialDataOf(cc: CountryCode): string {
  const n = cc === "PH" ? "the Philippines" : COUNTRIES[cc].name;
  return `${n.endsWith("s") ? `${n}'` : `${n}'s`} official data`;
}

/**
 * The official source failed or timed out (OfficialUnavailableError, or a proxy/network error): COPY §10's
 * "API error / timeout" row, per country. With a cached snapshot the client shows it, marked with its age, plus
 * `cachedLine`; without one it shows `title` + `line` and a Try again button.
 */
export function officialDownCopy(cc: CountryCode, cachedObservedAt?: string | null, now = Date.now(), viewerOffsetHours?: number) {
  const data = officialDataOf(cc);
  const title = `Can't reach ${data} right now`;
  let cachedLine: string | null = null;
  if (cachedObservedAt) {
    const min = Math.max(0, Math.round((now - Date.parse(cachedObservedAt)) / 60_000));
    const age = min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.floor(min / 60)} hr${Math.floor(min / 60) === 1 ? "" : "s"} ago` : `${Math.floor(min / 1440)} days ago`;
    cachedLine = `${title}. Showing the last reading we got, from ${stationTime(cachedObservedAt, cc, viewerOffsetHours)} (${age}).`;
  }
  return { title, line: "We'll try again in a few minutes.", cachedLine, statusLine: `${title}. We'll try again in a few minutes.` };
}

/** A cached snapshot re-judged for staleness at `now` (a reading cached an hour ago may be stale by now). */
export function cachedCountrySnapshot(s: CountrySnapshot, now: number): CountrySnapshot {
  return { ...s, stale: now - Date.parse(s.observedAt) > STALE_AFTER_MS };
}

export const NOTICE_COPY = {
  noAnchor: "There's no official station within 25 km to check these sensors against, so this is an estimate, not a measurement.",
  implausible: "A station reading looked wrong and was left out.",
  offline: "A nearby station hasn't reported for over a day, so it was left out.",
} as const;

/** See CountryDisplay.notices. */
export function snapshotNotices(s: Pick<CountrySnapshot, "pm25Kind" | "stations" | "notes">): string[] {
  const out: string[] = [];
  // (When the official source is down the stations exist but aren't answering: the kind label says that instead.)
  if (s.pm25Kind === "crowd_estimate" && !s.notes.includes("official_unavailable") && !s.stations.some((x) => x.grade === "reference" && x.distanceKm !== null && x.distanceKm <= 25)) {
    out.push(NOTICE_COPY.noAnchor);
  }
  if (s.notes.includes("implausible_dropped")) out.push(NOTICE_COPY.implausible);
  if (s.notes.includes("offline_dropped")) out.push(NOTICE_COPY.offline);
  return out;
}

const AVG = (a: "24h" | "1h" | "nowcast") => (a === "24h" ? "24-hr" : a === "nowcast" ? "hourly" : "1-hr");

function km(d: number): string {
  return d < 10 ? d.toFixed(1) : String(Math.round(d));
}

/** The official index row in English, with the authority's word alongside (SPEC v2.0 §6). */
export function officialRow(s: Pick<CountrySnapshot, "official" | "localBand" | "bandBasis">): OfficialRowModel | null {
  const o = s.official;
  if (!o) return null;
  let en: string | null = null;
  let local: string | null = null;
  let lang = "en";
  if (s.bandBasis === "official_index" && s.localBand) {
    en = s.localBand.labelEn;
    local = s.localBand.labelLocal;
    lang = s.localBand.lang;
  } else {
    let b = null;
    try {
      b = classifyIndex(o.scaleId, o.value);
      lang = getScale(o.scaleId).lang;
    } catch {
      /* unknown scale: keep the authority's verbatim word */
    }
    if (b && (!o.category || o.category === b.labelLocal || o.category === b.labelEn)) {
      en = b.labelEn;
      local = b.labelLocal;
    } else if (o.category) {
      local = o.category;
    }
  }
  if (local && en && local === en) local = null;
  const label = `${o.agency} ${o.name} (${AVG(o.averaging)})`;
  const word = en ?? local;
  return { label, value: o.value, en, local, lang, text: `${label}: ${o.value}${word ? ` · ${word}` : ""}` };
}

export interface DisplayOptions {
  placeName?: string;
  /** Viewer's UTC offset (hours); zones are printed only when the station's differs. */
  viewerOffsetHours?: number;
  /** Place longitude (picks the Indonesian zone for UTC-stamped crowd data). */
  lon?: number;
}

export function countryDisplay(s: CountrySnapshot, opts: DisplayOptions = {}): CountryDisplay {
  const b = s.localBand;
  let chip: ChipModel | null = null;
  if (b) {
    const basisNote =
      s.bandBasis === "official_index" && s.official
        ? `${b.agency} category for the ${AVG(s.official.averaging)} ${s.official.name}`
        : s.bandFromEstimate
          ? `${b.agency} category, applied to the community-sensor estimate`
          : `${getScale(b.scaleId).indexName ?? b.agency} category for this hour's PM2.5`;
    chip = {
      en: b.labelEn,
      local: b.labelLocal && b.labelLocal !== b.labelEn ? b.labelLocal : null,
      lang: b.lang,
      agency: b.agency,
      color: b.color,
      shape: b.shape,
      basisNote,
      estimate: !!s.bandFromEstimate,
    };
  } else if (s.pm25 !== null && CHIP_SCALE[s.country] === null) {
    // No national scale: WHO 2021 guidance bands on the hourly estimate (COPY.md §20).
    const w = whoVerdictBand(s.pm25);
    chip = {
      en: `WHO guide: ${w.word}`,
      local: null,
      lang: "en",
      agency: "WHO 2021",
      color: WHO_CHIP_COLOR[w.level],
      shape: (["circle", "half", "triangle", "octagon"] as const)[w.level],
      basisNote: "WHO 2021 guidance, applied to this hour's estimate. There's no national scale here.",
      estimate: s.pm25Kind === "crowd_estimate",
    };
  }
  const time = stationTime(s.observedAt, s.country, opts.viewerOffsetHours, opts.lon);
  let provenance: string | null = null;
  let kindLabel: string | null = null;
  const range = s.range ? ` · range ${s.range[0]}–${s.range[1]}` : "";
  if (s.pm25Kind === "official_1h" && s.nearest) {
    kindLabel = "Official reading";
    provenance = s.range
      ? `Estimate for ${opts.placeName ?? "your spot"} from official stations${range} · ${time}`
      : `Measured at ${s.nearest.name} station${s.nearest.distanceKm !== null ? ` · ${km(s.nearest.distanceKm)} km` : ""} · ${time}`;
  } else if (s.pm25Kind === "crowd_estimate") {
    kindLabel = "Community sensors · estimate";
    const n = Math.max(1, s.stations.filter((x) => x.grade === "lowcost" && (x.distanceKm ?? 99) <= 10).length);
    provenance = `${NO_SCALE_COPY.crowdProvenance(Math.min(n, 8))}${range} · ${time}`;
  } else if (s.nearest) {
    const agency = s.official?.agency ?? b?.agency ?? "";
    provenance = `Nearest ${agency ? `${agency} ` : ""}station: ${s.nearest.name}${s.nearest.distanceKm !== null ? ` · ${km(s.nearest.distanceKm)} km` : ""} · ${time}`;
  }
  const official = officialRow(s);
  const officialExplainer =
    official && s.official?.averaging === "24h" && s.pm25 !== null
      ? "The 24-hr index averages the last 24 hours. The number above is the latest hour."
      : null;
  let noNumber: CountryDisplay["noNumber"] = null;
  if (s.pm25 === null) {
    noNumber = s.official
      ? {
          title: "No official hourly reading here",
          line: `${s.official.agency} publishes a ${AVG(s.official.averaging)} index for this area, so that's what we show. It moves slowly: it averages the last ${s.official.averaging === "24h" ? "24 hours" : "hours"}.`,
        }
      : { title: "No reading near here right now", line: "There's no official station or community sensor close enough for an honest number." };
  }
  return {
    sensorLine: nearbySensorLine(s),
    notices: snapshotNotices(s),
    chip,
    numberSub: numberSub(s),
    kindLabel,
    provenance,
    official,
    officialExplainer,
    noNumber,
    whoLine: !b && s.whoMultiple !== null ? NO_SCALE_COPY.whoLine(s.whoMultiple) : null,
    attribution: s.attribution.map((a) => ({ text: a.text, url: a.url })),
  };
}

/**
 * WHO-guide chip tones, low → very high: calm neutral blues, deepening towards indigo. None is an authority's colour
 * (not PCD's #00BFF3, DOE's #3D8AF7 or ISPU's #0000CC), and each is ≥ 3:1 against both the light paper (#f3f1ec:
 * 3.0, 3.5, 4.2, 4.6) and the dark paper (#14232b: 4.7, 4.1, 3.4, 3.1). Chip text uses the ink mix, as for any band.
 */
export const WHO_CHIP_COLOR = ["#6690AE", "#5B84B1", "#5873AE", "#6268A9"] as const;

/**
 * The small line directly under the big number. For a community estimate it says why there's no official number
 * (these are the only places "No official reading near here" and "no official air-quality scale" may appear).
 */
export function numberSub(s: Pick<CountrySnapshot, "pm25Kind" | "notes" | "country" | "stations" | "official">): string {
  if (s.pm25Kind !== "crowd_estimate") return "PM2.5 · last hour";
  const tail = "community sensors estimate";
  if (s.notes.includes("official_unavailable")) return `${cap(officialDataOf(s.country))} isn't responding right now · ${tail}`;
  if (CHIP_SCALE[s.country] === null) return `There's no official air-quality scale here · ${tail}`;
  if (!s.stations.some((x) => x.grade === "reference" && x.distanceKm !== null && x.distanceKm <= 25)) return `No official reading near here · ${tail}`;
  return "PM2.5 · community sensors";
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export const SENSOR_LINE_KM = 20;

/** See CountryDisplay.sensorLine. Only when there is no big number and the chip comes from a 24-hr index. */
export function nearbySensorLine(s: CountrySnapshot): string | null {
  const b = s.localBand;
  if (s.pm25 !== null || !b || s.bandBasis !== "official_index") return null;
  const worse = s.stations.filter((x) => {
    if (x.grade !== "lowcost" || x.pm25_1h === null || x.distanceKm === null || x.distanceKm > SENSOR_LINE_KM) return false;
    const cat = classifyPm25(b.scaleId, x.pm25_1h);
    return !!cat && cat.level !== null && cat.level > b.level;
  });
  if (!worse.length) return null;
  const top = Math.round(Math.max(...worse.map((x) => x.pm25_1h!)));
  return worse.length === 1
    ? `A community sensor nearby reads ${top} µg/m³ right now.`
    : `Community sensors nearby read up to ${top} µg/m³ right now.`;
}

/** Main agency for a snapshot ("PCD", "DOE", "BMKG", "community sensors"). */
export function mainAgency(s: CountrySnapshot): string {
  return s.localBand?.agency ?? s.official?.agency ?? (s.pm25Kind === "crowd_estimate" ? "community sensors" : COUNTRIES[s.country].name);
}

/** The recorded hour shown in the Preview ribbon: the 17:00 ICT/WIB (18:00 MYT) publication the fixtures captured. */
export const PREVIEW_HOUR = "2026-09-28T10:00:00Z";

/**
 * Preview ribbon (recorded fixtures, proxy not deployed). Never presents recorded data as live:
 * "Preview · recorded data from 28 Sep, 5pm. Live once our server is up." The time is the recorded publication hour
 * in the place's own time, with its zone when that differs from the viewer's.
 */
export function previewRibbon(s: Pick<CountrySnapshot, "country">, viewerOffsetHours?: number, lon?: number, hour = PREVIEW_HOUR): string {
  const local = toLocalIso(hour, s.country, lon);
  const d = new Date(Date.parse(local) + (isoOffsetHours(local) ?? 0) * 3600_000);
  const t = stationTime(hour, s.country, viewerOffsetHours, lon);
  return `Preview · recorded data from ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${t}. Live once our server is up.`;
}

const attributionLine = (s: CountrySnapshot) => `Data: ${s.attribution.map((a) => a.text.replace(/^Data: /, "")).join(", ")}`;

/**
 * Share text (SPEC v2.0 §9): names the scale and the authority, never mixes scales.
 * "PM2.5 14 µg/m³ in Bangkok at 5pm ICT · PCD Thai AQI (24-hr): 19 · Excellent · Data: … · via HazeNow hazenow.pages.dev"
 */
export function countryShareText(s: CountrySnapshot, placeName: string, site = "hazenow.pages.dev", lon?: number): string {
  const when = stationTime(s.observedAt, s.country, -99, lon);
  const parts: string[] = [];
  if (s.stale) parts.push("Latest reading is delayed.");
  if (s.pm25 !== null) {
    parts.push(`PM2.5 ${s.pm25} µg/m³${s.pm25Kind === "crowd_estimate" ? " (community-sensor estimate)" : ""} in ${placeName} at ${when}`);
  } else parts.push(`${placeName} at ${when}`);
  const b = s.localBand;
  if (b && s.bandBasis === "pm25_1h") {
    const scaleName = getScale(b.scaleId).indexName ?? b.scaleId;
    parts.push(`${b.labelLocal}${b.labelLocal !== b.labelEn ? ` (${b.labelEn})` : ""}, ${scaleName} category, ${b.agency} hourly`);
  } else {
    const o = officialRow(s);
    if (o) parts.push(o.text);
  }
  if (!b && s.whoMultiple !== null) parts.push(NO_SCALE_COPY.whoLine(s.whoMultiple).replace(/\.$/, ""));
  const w = trendWord(s.history);
  if (!s.stale && s.pm25 !== null && w) parts.push(w);
  return `${parts.join(" · ")} · ${attributionLine(s)} · via HazeNow ${site}`;
}

/**
 * Now card and link-preview card for a country (share cards 1 and 6). Same layout as SG; the place line, band words,
 * advice source, dot colour and attribution follow the country. English only (the card font has no Thai/Vietnamese
 * glyph coverage guarantees). Recorded preview data is never shared: clients disable sharing in preview mode.
 */
export function countryNowCard(s: CountrySnapshot, placeName: string, profile: readonly Profile[] = ["general"], lon?: number): NowCard {
  const d = countryDisplay(s, { placeName, lon });
  const v = countryVerdict(s, profile);
  const when = stationDateTime(s.observedAt, s.country, lon);
  const general = countryVerdict(s, ["general"]).headline;
  const sensitive = countryVerdict(s, ["elderly"]).headline;
  const detail = !s.stale ? trendDetail(s.history) : "";
  const agency = mainAgency(s);
  const hourlyLabel = s.pm25Kind === "crowd_estimate" ? "community-sensor estimate" : "1-hr PM2.5";
  const chipWords = d.chip ? `${d.chip.en} (${d.chip.agency})` : null;
  const officialText = d.official?.text ?? null;
  const psiLine = [
    officialText ?? (chipWords && s.bandBasis === "pm25_1h" ? `${chipWords} for this hour's PM2.5` : null),
    officialText ? (s.stale ? `This reading is for the ${formatLocalTime(toLocalIso(s.observedAt, s.country, lon))} hour` : d.officialExplainer?.replace(/\.$/, "")) : null,
    d.whoLine?.replace(/\.$/, ""),
  ]
    .filter(Boolean)
    .join(". ");
  return {
    kind: "now",
    when,
    place: placeName,
    hook: s.stale ? `${placeName} · reading from ${when} (latest available)` : `Air near ${placeName} · ${when}`,
    headline: s.stale ? "Latest reading is delayed." : v.headline,
    pm25: s.pm25 ?? 0,
    band: s.band ?? "normal",
    pmDetail: `µg/m³ ${hourlyLabel}${detail ? ` · ${detail}` : ""}`,
    adviceLabel: s.stale ? `${agency}-based advice for that hour` : s.band ? `Advice for now, from ${agency}’s guidance` : "Advice for now",
    adviceMost: general,
    adviceVulnerable: sensitive,
    psiLine: psiLine ? `${psiLine}.` : "",
    station: d.provenance?.replace(/ · [^·]*$/, "") ?? agency,
    credit: CREDIT,
    dotColor: s.localBand?.color ?? "#9FB3BB",
    dataLine: attributionLine(s),
  };
}

export function countryPreviewCard(s: CountrySnapshot, placeName: string, profile: readonly Profile[] = ["general"], lon?: number): PreviewCard {
  const n = countryNowCard(s, placeName, profile, lon);
  const o = s.official;
  return {
    kind: "preview",
    when: n.when,
    place: placeName,
    hook: n.hook,
    headline: n.headline,
    pm25: n.pm25,
    band: n.band,
    direction: s.stale || !trendWord(s.history) ? null : s.trend.direction,
    psi: null,
    credit: CREDIT,
    dotColor: n.dotColor,
    bandLabel: s.localBand ? s.localBand.labelEn : "No official scale",
    officialShort: o ? `${o.agency} ${o.name} ${o.value}` : "Community sensors",
    dataLine: n.dataLine,
  };
}

/** Verdict re-exported for convenience with the display model. */
export { countryVerdict };
