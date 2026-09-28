/**
 * Share system (SPEC v1.6, docs/SHARING.md, docs/share-cards/): which card to offer, and the words on it.
 * Pure: the web/native renderers only lay these strings out. No Instant PSI, no "~", no anti-NEA framing.
 */
import { bandInfo, haversineKm, isValidReading, psiLabel } from "./math.js";
import { formatSgtTime, regionLabel } from "./format.js";
import { actions, normaliseProfile, trendWord, trendWords, verdict, type Profile, type TrendWord } from "./experience.js";
import type { Band, HistoryPoint, LatLon, Snapshot, TrendDirection } from "./types.js";

export type ShareCardId = "now" | "clocks" | "group" | "clear";
export type Persona = "kids" | "elderly" | "heart_lung" | "pregnant" | "exercising" | "outdoor_worker";

/** Persona priority and chip labels (SPEC v1.6 rule 2). */
export const PERSONAS: readonly { id: Persona; chip: string }[] = [
  { id: "kids", chip: "For the kids · Recess check" },
  { id: "elderly", chip: "For Mum and Dad" },
  { id: "heart_lung", chip: "For heart and lung health" },
  { id: "pregnant", chip: "For mums-to-be" },
  { id: "exercising", chip: "Run check" },
  { id: "outdoor_worker", chip: "Site check" },
];

export const CREDIT = "Yong Quan Tan";
export const SHARE_SITE = "hazenow.pages.dev";
/** 1-hr vs 24-hr gap (µg/m³) that makes the Two clocks card the pick (rule 4). */
export const CLOCKS_GAP = 40;
/** All-clear looks back this far for an Elevated+ hour (rule 1). */
export const ALL_CLEAR_LOOKBACK_H = 12;

export interface ShareContext {
  /** Area or place name to print ("Tampines"). Defaults to the region / "Singapore". */
  placeName?: string;
  /** The user's point (GPS or area centroid), for the station distance line. */
  point?: LatLon | null;
  /** Opened from "Why two numbers?" → Two clocks (rule 4). */
  fromWhyTwoNumbers?: boolean;
}

export interface SharePick {
  card: ShareCardId;
  /** Persona for the "For our group" card (set whenever the profile has one). */
  persona?: Persona;
  /** Other eligible cards, in display order (never includes `card`). */
  alternates: ShareCardId[];
}

const HOUR = 3600_000;
const elevatedPlus = (b: Band) => b !== "normal";

export function personaFor(profile: readonly Profile[]): Persona | undefined {
  const ids = normaliseProfile(profile);
  return PERSONAS.find((p) => ids.includes(p.id))?.id;
}

/** Latest NEA 24-hr average PM2.5 at the spot, falling back to the mean of the hourly history. */
export function dayAverage(s: Pick<Snapshot, "history">): number | null {
  const last = s.history[s.history.length - 1];
  if (last && isValidReading(last.pm25Avg24h)) return last.pm25Avg24h as number;
  const vals = s.history.map((h) => h.pm25).filter(isValidReading);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

function wasElevatedRecently(history: readonly HistoryPoint[], observedAt: string): boolean {
  const t = Date.parse(observedAt);
  return history.some((h) => {
    const ht = Date.parse(h.time);
    return ht < t && t - ht <= ALL_CLEAR_LOOKBACK_H * HOUR && h.pm25 > 55;
  });
}

/**
 * Auto-pick (SPEC v1.6, first match wins):
 * 1 Normal now and ≥ Elevated within 12 h → clear
 * 2 persona in profile and band ≥ Elevated → group
 * 3 band ≥ Elevated → now
 * 4 |1-hr − 24-hr avg| ≥ 40, or opened from "Why two numbers?" → clocks
 * 5 otherwise → now
 * Alternates: now, clocks, group (if a persona), clear (only if rule 1 applies).
 */
export function pickShareCard(
  s: Pick<Snapshot, "band" | "pm25" | "history" | "observedAt">,
  profile: readonly Profile[] = ["general"],
  history: readonly HistoryPoint[] = s.history,
  context: ShareContext = {},
): SharePick {
  const persona = personaFor(profile);
  const clearEligible = s.band === "normal" && wasElevatedRecently(history, s.observedAt);
  const avg = dayAverage({ history: history as HistoryPoint[] });
  let card: ShareCardId;
  if (clearEligible) card = "clear";
  else if (persona && elevatedPlus(s.band)) card = "group";
  else if (elevatedPlus(s.band)) card = "now";
  else if (context.fromWhyTwoNumbers || (avg !== null && Math.abs(s.pm25 - avg) >= CLOCKS_GAP)) card = "clocks";
  else card = "now";
  const eligible: ShareCardId[] = ["now", "clocks", ...(persona ? (["group"] as const) : []), ...(clearEligible ? (["clear"] as const) : [])];
  return { card, persona, alternates: eligible.filter((c) => c !== card) };
}

/* ------------------------------------------------------------------ episode stats (All clear) */

export interface EpisodeStats {
  worst: { pm25: number; time: string };
  /** Consecutive hourly readings above Normal (> 55) in the most recent episode. */
  hoursAbove: number;
  /** First and last hour above Normal. */
  start: string;
  end: string;
  /** True if the episode may be longer than the history we have. */
  truncated: boolean;
}

/**
 * The most recent run of hours above Normal before now: worst hour and length.
 * Consecutive = 1 hour apart; a missing hour ends the run. Null if there was none.
 */
export function episodeStats(history: readonly HistoryPoint[]): EpisodeStats | null {
  let end = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].pm25 > 55) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  let start = end;
  while (
    start > 0 &&
    history[start - 1].pm25 > 55 &&
    Date.parse(history[start].time) - Date.parse(history[start - 1].time) === HOUR
  ) {
    start--;
  }
  let worst = history[start];
  for (let i = start; i <= end; i++) if (history[i].pm25 > worst.pm25) worst = history[i];
  return {
    worst: { pm25: worst.pm25, time: worst.time },
    hoursAbove: end - start + 1,
    start: history[start].time,
    end: history[end].time,
    truncated: start === 0,
  };
}

/* ------------------------------------------------------------------ card words */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sgt = (iso: string) => new Date(Date.parse(iso) + 8 * HOUR);

/** "Mon 28 Sep, 5pm" (Singapore time). Absolute time only on images (SHARING §4.1). */
export function formatCardWhen(iso: string): string {
  const d = sgt(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${formatSgtTime(iso)}`;
}

/** Filename with the time in it: "hazenow-tampines-2026-09-28-1700.png". */
export function shareFileName(place: string, observedAt: string, card: ShareCardId | "preview" = "now"): string {
  const d = sgt(observedAt).toISOString();
  const slug = place.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "singapore";
  return `hazenow-${slug}-${d.slice(0, 10)}-${d.slice(11, 13)}${d.slice(14, 16)}${card === "now" ? "" : `-${card}`}.png`;
}

/** NEA's own 1-hr PM2.5 advice split (healthy / vulnerable), per band. */
export const NEA_ADVICE: Record<Band, { most: string; vulnerable: string }> = {
  normal: { most: "Continue normal activities.", vulnerable: "Continue normal activities." },
  elevated: { most: "Reduce strenuous outdoor activity.", vulnerable: "Avoid strenuous outdoor activity." },
  high: { most: "Avoid strenuous outdoor activity.", vulnerable: "Avoid all outdoor activity." },
  very_high: { most: "Minimise all outdoor activity.", vulnerable: "Avoid all outdoor activity." },
};

const HEADLINE_WORD: Record<TrendWord, string> = {
  rising: "rising",
  "rising fast": "rising fast",
  steady: "steady",
  easing: "easing",
  "clearing fast": "clearing",
};

/** "Elevated, and rising." / "Normal right now." */
export function nowHeadline(s: Pick<Snapshot, "band" | "history">): string {
  const label = bandInfo(s.band).label;
  const w = trendWord(s.history);
  return w ? `${label}, and ${HEADLINE_WORD[w]}.` : `${label} right now.`;
}

/** "up 36 in 2 hours" / "steady over the last hour" / "" */
export function trendDetail(history: readonly HistoryPoint[]): string {
  if (!trendWord(history)) return "";
  const t = trendWords(history);
  const i = t.indexOf(": ");
  return (i >= 0 ? t.slice(i + 2) : t).replace(/^Steady/, "steady");
}

interface Place {
  /** printed place name */
  name: string;
  /** "Air near Tampines" / "Air across Singapore" */
  hook: string;
  /** "NEA East station · 2.2 km away" / "NEA East station" / "Average of NEA stations" */
  station: string;
  /** short station for tight footers: "East station" */
  stationShort: string;
  /** "near Tampines" / "in the West" / "across Singapore", for share text */
  phrase: string;
}

export function sharePlace(s: Pick<Snapshot, "locationMode" | "nearestRegion" | "regions">, ctx: ShareContext = {}): Place {
  const R = s.nearestRegion ? regionLabel(s.nearestRegion) : "";
  if (s.locationMode === "island") {
    const name = ctx.placeName ?? "Singapore";
    const hook = s.nearestRegion ? `Air near ${ctx.placeName ?? R}` : "Air across Singapore";
    return { name: ctx.placeName ?? (s.nearestRegion ? R : "Singapore"), hook, station: "Average of NEA stations", stationShort: "NEA stations", phrase: s.nearestRegion ? `near ${name}` : "across Singapore" };
  }
  let station = `NEA ${R} station`;
  if (s.locationMode === "gps" && ctx.point) {
    const r = s.regions[s.nearestRegion];
    if (r) {
      const d = haversineKm(ctx.point, { lat: r.lat, lon: r.lon });
      station += ` · ${d < 10 ? d.toFixed(1) : Math.round(d)} km away`;
    }
  }
  const name = ctx.placeName ?? R;
  const phrase = ctx.placeName ? `near ${ctx.placeName}` : s.locationMode === "gps" ? "near me" : s.nearestRegion === "central" ? "in Central" : `in the ${R}`;
  // A picked region reads "Air in the West"; a place (area / GPS) reads "Air near Tampines".
  const hook = ctx.placeName || s.locationMode === "gps" ? `Air near ${name}` : `Air ${phrase}`;
  return { name, hook, station, stationShort: `${R} station`, phrase };
}

export interface NowCard {
  kind: "now";
  when: string;
  place: string;
  hook: string;
  headline: string;
  pm25: number;
  band: Band;
  /** "µg/m³ 1-hr PM2.5 · up 36 in 2 hours" */
  pmDetail: string;
  adviceLabel: string;
  adviceMost: string;
  adviceVulnerable: string;
  psiLine: string;
  station: string;
  credit: string;
  /** Outside SG: the authority's band colour for the dot (else from `band`). */
  dotColor?: string;
  /** Outside SG: attribution line (default "Data: NEA via data.gov.sg"). */
  dataLine?: string;
}
export interface ClocksCard {
  kind: "clocks";
  when: string;
  place: string;
  headlineLines: [string, string];
  pm25: number;
  band: Band;
  avg: number | null;
  psi: number | null;
  /** last ≤24 hourly values, oldest → newest */
  bars: number[];
  /** Label at the right end of the chart axis: "Now", or the reading's hour when stale (COPY §19). */
  axisEnd: string;
  /** First box label: "The last hour", or "The 3pm hour" when stale (COPY §19). */
  nowLabel: string;
  caption: string;
  credit: string;
}
export interface GroupCard {
  kind: "group";
  when: string;
  place: string;
  chip: string;
  headline: string;
  pm25: number;
  band: Band;
  /** "µg/m³ · Elevated · steady" */
  statsRest: string;
  actions: string[];
  station: string;
  credit: string;
}
export interface ClearCard {
  kind: "clear";
  when: string;
  place: string;
  headline: string;
  pm25: number;
  band: Band;
  bodyLines: [string, string];
  stats: string;
  credit: string;
}
export interface PreviewCard {
  kind: "preview";
  when: string;
  place: string;
  hook: string;
  headline: string;
  pm25: number;
  band: Band;
  direction: TrendDirection | null;
  psi: number | null;
  credit: string;
  /** Outside SG: authority colour, band words and official line instead of SG's. */
  dotColor?: string;
  bandLabel?: string;
  /** Replaces "24-hr PSI {psi}" in the panel. */
  officialShort?: string;
  dataLine?: string;
}
export type ShareCardContent = NowCard | ClocksCard | GroupCard | ClearCard | PreviewCard;

function nextCheck(observedAt: string): string {
  return formatSgtTime(new Date(Date.parse(observedAt) + HOUR).toISOString());
}

export const STALE_HEADLINE = "Latest NEA reading is delayed.";
export const STALE_NEXT_CHECK = "Check hazenow.pages.dev for NEA's next update.";

/** COPY §19: "{Area} · reading from {time} (latest available)". */
export function stalePlaceLine(place: string, observedAt: string): string {
  return `${place} · reading from ${formatCardWhen(observedAt)} (latest available)`;
}

/** The words for one card. `persona` is used by the group card (defaults to the profile's persona). */
export function shareCardContent(
  card: ShareCardId | "preview",
  s: Snapshot,
  profile: readonly Profile[] = ["general"],
  ctx: ShareContext = {},
): ShareCardContent {
  const place = sharePlace(s, ctx);
  const when = formatCardWhen(s.observedAt);
  const label = bandInfo(s.band).label;
  const base = { when, place: place.name, pm25: s.pm25, band: s.band, credit: CREDIT };
  const c = cardContent(card, s, profile, ctx, place, when, label, base);
  if (!s.stale) return c;
  // COPY §19: never present stale data as "now".
  const line = stalePlaceLine(place.name, s.observedAt);
  // An old trend could mislead, so stale cards drop it; the chart axis ends at the reading's hour.
  switch (c.kind) {
    case "now": {
      const hour = formatSgtTime(s.observedAt);
      const psi = s.officialPsi24h === null ? "The 24-hr PSI" : `The 24-hr PSI (${s.officialPsi24h})`;
      return {
        ...c,
        hook: line,
        headline: STALE_HEADLINE,
        pmDetail: "µg/m³ 1-hr PM2.5",
        adviceLabel: "NEA’s advice for that hour",
        psiLine: `${psi} averages the whole day. This reading is for the ${hour} hour.`,
      };
    }
    case "preview":
      return { ...c, hook: line, headline: STALE_HEADLINE, direction: null };
    case "group":
      return {
        ...c,
        place: line,
        when: "",
        headline: STALE_HEADLINE,
        statsRest: `µg/m³ · ${label}`,
        // "Next check at {old hour + 1}" would already be in the past.
        actions: c.actions.map((a) => (/^Next check at /.test(a) ? STALE_NEXT_CHECK : a)),
      };
    case "clear":
      return { ...c, place: line, when: "", headline: STALE_HEADLINE };
    case "clocks":
      return { ...c, place: line, when: "", axisEnd: formatSgtTime(s.observedAt), nowLabel: `The ${formatSgtTime(s.observedAt)} hour` };
  }
}

function cardContent(
  card: ShareCardId | "preview",
  s: Snapshot,
  profile: readonly Profile[],
  ctx: ShareContext,
  place: Place,
  when: string,
  label: string,
  base: { when: string; place: string; pm25: number; band: Band; credit: string },
): ShareCardContent {
  switch (card) {
    case "now": {
      const detail = trendDetail(s.history);
      return {
        ...base,
        kind: "now",
        hook: `${place.hook} · ${when}`,
        headline: nowHeadline(s),
        pmDetail: `µg/m³ 1-hr PM2.5${detail ? ` · ${detail}` : ""}`,
        adviceLabel: "NEA’s advice for the next hour",
        adviceMost: NEA_ADVICE[s.band].most,
        adviceVulnerable: NEA_ADVICE[s.band].vulnerable,
        psiLine:
          s.officialPsi24h === null
            ? "The 24-hr PSI averages the whole day. This is the last hour. Same NEA data, different clock."
            : `The 24-hr PSI (${s.officialPsi24h}) averages the whole day. This is the last hour. Same NEA data, different clock.`,
        station: place.station,
      };
    }
    case "clocks": {
      const avg = dayAverage(s);
      const falling = avg !== null && s.pm25 < avg;
      return {
        ...base,
        kind: "clocks",
        headlineLines: ["Same NEA data.", "Two clocks."],
        avg,
        psi: s.officialPsi24h,
        bars: s.history.slice(-24).map((h) => h.pm25),
        axisEnd: "Now",
        nowLabel: "The last hour",
        caption: falling
          ? "The daily number catches up slowly, both ways: the air has cleared, but the 24-hr average stays high for a while."
          : "The daily number catches up slowly, both ways: when haze clears, it stays high for a while too.",
      };
    }
    case "group": {
      const persona = personaFor(profile);
      const chip = PERSONAS.find((p) => p.id === persona)?.chip ?? "For our group";
      const v = verdict(s.band, profile, s.trend);
      const short = v.short;
      const headline = s.band === "normal" ? v.headline : /for now/i.test(short) ? `${short}.` : `${short}, for now.`;
      const acts = actions(s.band, profile, 2);
      const w = trendWord(s.history);
      return {
        ...base,
        kind: "group",
        chip,
        headline,
        statsRest: `µg/m³ · ${label}${w ? ` · ${w}` : ""}`,
        actions: [...(acts.length ? acts : ["Enjoy the fresh air."]), `Next check at ${nextCheck(s.observedAt)}.`],
        station: place.stationShort,
      };
    }
    case "clear": {
      const ep = episodeStats(s.history);
      let stats = "";
      if (ep) {
        const sameDay = sgt(ep.worst.time).getUTCDate() === sgt(s.observedAt).getUTCDate();
        const at = `${formatSgtTime(ep.worst.time)}${sameDay ? "" : ` ${DAYS[sgt(ep.worst.time).getUTCDay()]}`}`;
        const hrs = `${ep.truncated ? "At least " : ""}${ep.hoursAbove} hour${ep.hoursAbove === 1 ? "" : "s"} above Normal.`;
        stats = `Worst hour this episode: ${ep.worst.pm25} at ${at}. ${hrs}`;
      }
      return {
        ...base,
        kind: "clear",
        headline: "Air’s back to Normal.",
        bodyLines: [`PM2.5 ${s.pm25} µg/m³. Fine to be out.`, "Open the windows."],
        stats,
      };
    }
    case "preview":
      return {
        ...base,
        kind: "preview",
        hook: `${place.hook} · ${when}`,
        headline: nowHeadline(s),
        direction: trendWord(s.history) ? s.trend.direction : null,
        psi: s.officialPsi24h,
      };
  }
}

/** Share text per card (COPY §15 style, headline-matched), always ending with the site. */
export function shareCardText(
  card: ShareCardId,
  s: Snapshot,
  profile: readonly Profile[] = ["general"],
  ctx: ShareContext = {},
  site = SHARE_SITE,
): string {
  const place = sharePlace(s, ctx);
  const label = bandInfo(s.band).label;
  const t = formatSgtTime(s.observedAt);
  const psi = s.officialPsi24h === null ? "" : ` NEA 24-hr PSI: ${s.officialPsi24h} (${psiLabel(s.officialPsi24h)}).`;
  const credit = "Data: NEA via data.gov.sg.";
  if (s.stale) {
    // COPY §19: say it's delayed, give the reading's own time, never "right now".
    return `${STALE_HEADLINE} ${stalePlaceLine(place.name, s.observedAt)}: ${label} (PM2.5 ${s.pm25}).${psi} ${credit} ${site}`;
  }
  switch (card) {
    case "now": {
      const w = trendWord(s.history);
      return `Air ${place.phrase} at ${t}: ${label} (PM2.5 ${s.pm25})${w ? `, ${w}` : ""}.${psi} ${credit} ${site}`;
    }
    case "clocks": {
      const avg = dayAverage(s);
      return `Same NEA data, two clocks. ${place.name} at ${t}: last hour PM2.5 ${s.pm25}${avg !== null ? `, 24-hr average ${avg}` : ""}.${psi} ${credit} ${site}`;
    }
    case "group": {
      const c = shareCardContent("group", s, profile, ctx) as GroupCard;
      return `${c.chip}, ${place.name} at ${t}: ${c.headline} PM2.5 ${s.pm25} (${label}). ${credit} ${site}`;
    }
    case "clear": {
      const c = shareCardContent("clear", s, profile, ctx) as ClearCard;
      return `Air's back to Normal ${place.phrase} (PM2.5 ${s.pm25} at ${t}). Fine to be out.${c.stats ? ` ${c.stats.replace("’", "'")}` : ""} ${credit} ${site}`;
    }
  }
}
