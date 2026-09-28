/**
 * SPEC v1.1/v1.2 "Experience & trust": verdicts, actions, anchors, uncertainty, provenance, trend words.
 * All pure. Strings are verbatim from docs/COPY.md (canonical); other clients must match them.
 * The one addition not yet in COPY.md is the `outdoor_worker` profile (SPEC v1.2 §6); its strings are marked below.
 */
import { DISAGREE_UGM3, SNAP_KM, TYPICAL_PM25, UNCERTAIN_KM } from "./constants.js";
import { formatSgtTime, regionLabel } from "./format.js";
import { bandInfo, haversineKm, isValidReading, roundHalfUp } from "./math.js";
import type { Band, HistoryPoint, LatLon, RegionReading, Snapshot, Trend } from "./types.js";

/* ------------------------------------------------------------------ profiles (COPY §1) */

export type Profile = "general" | "kids" | "elderly" | "pregnant" | "heart_lung" | "exercising" | "outdoor_worker";

export interface ProfileInfo {
  id: Profile;
  /** picker label */
  label: string;
  /** "for" label under the headline */
  forLabel: string;
  /** form used when combined: "you", "kids", "your workout" */
  combined: string;
  sensitive: boolean;
}

/** Order here is also the tie-break priority for mixed profiles (COPY §1). */
export const PROFILES: readonly ProfileInfo[] = [
  { id: "general", label: "Just me, generally healthy", forLabel: "For you", combined: "you", sensitive: false },
  { id: "kids", label: "Kids", forLabel: "For kids", combined: "kids", sensitive: true },
  { id: "elderly", label: "Older adults (65+)", forLabel: "For older adults", combined: "older adults", sensitive: true },
  { id: "pregnant", label: "Pregnant", forLabel: "For pregnancy", combined: "pregnancy", sensitive: true },
  { id: "heart_lung", label: "Asthma, COPD or a heart condition", forLabel: "For asthma, COPD & heart", combined: "asthma, COPD & heart", sensitive: true },
  { id: "exercising", label: "I exercise outdoors", forLabel: "For your workout", combined: "your workout", sensitive: false },
  // Not yet in COPY.md (SPEC v1.2 §6): wording ours.
  { id: "outdoor_worker", label: "I work outdoors", forLabel: "For outdoor work", combined: "outdoor work", sensitive: false },
];

const TIE_BREAK: Profile[] = ["heart_lung", "kids", "pregnant", "elderly", "exercising", "outdoor_worker", "general"];

export function isSensitive(profile: readonly Profile[]): boolean {
  return profile.some((p) => PROFILES.find((x) => x.id === p)?.sensitive);
}

/**
 * Clean up a picked profile: unknown ids dropped, empty → general,
 * "general" can't be combined with a sensitive option (picking a sensitive option unticks it).
 */
export function normaliseProfile(profile: readonly string[] | null | undefined): Profile[] {
  const known = PROFILES.map((p) => p.id);
  let out = [...new Set((profile ?? []).filter((p): p is Profile => known.includes(p as Profile)))];
  if (isSensitive(out)) out = out.filter((p) => p !== "general");
  if (out.length === 0) out = ["general"];
  return PROFILES.map((p) => p.id).filter((id) => out.includes(id));
}

/** "For you", "For you + kids", "For older adults + your workout", "For your household". */
export function forWhom(profile: readonly Profile[]): string {
  const ids = normaliseProfile(profile);
  if (ids.length >= 3) return "For your household";
  const infos = ids.map((id) => PROFILES.find((p) => p.id === id)!);
  if (infos.length === 1) return infos[0].forLabel;
  return `For ${infos.map((i) => i.combined).join(" + ")}`;
}

/* ------------------------------------------------------------------ verdicts (COPY §2) */

type Cell = { long: string; short: string; level: number };
const V = (long: string, short: string, level: number): Cell => ({ long, short, level });

/** level = strictness, used to pick the strictest row for a mixed profile. */
const VERDICTS: Record<Band, Record<Profile, Cell>> = {
  normal: {
    general: V("Fine to be out.", "Fine to be out", 0),
    kids: V("Fine for outdoor play.", "Fine for outdoor play", 0),
    elderly: V("Fine to be out.", "Fine to be out", 0),
    pregnant: V("Fine to be out.", "Fine to be out", 0),
    heart_lung: V("Fine to be out.", "Fine to be out", 0),
    exercising: V("Fine to exercise outside.", "Fine to exercise outside", 0),
    outdoor_worker: V("Fine to be out.", "Fine to be out", 0),
  },
  elevated: {
    general: V("OK to be out. Go easy on hard exercise.", "Go easy outdoors", 1),
    kids: V("Calm play outside is OK. Skip running games for now.", "Calm play only", 2),
    elderly: V("A gentle walk is OK. Skip hard exercise for now.", "Gentle activity only", 2),
    pregnant: V("Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only", 2),
    heart_lung: V("Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only", 2),
    exercising: V("Keep your workout light, or move it indoors.", "Light workout or go indoors", 2),
    outdoor_worker: V("OK to work outside. Take breaks indoors if you can.", "Take breaks indoors", 1),
  },
  high: {
    general: V("Short trips out are OK. Exercise indoors.", "No outdoor exercise", 2),
    kids: V("Indoor play for now. Keep trips out short.", "Indoor play for now", 3),
    elderly: V("Stay indoors for now if you can.", "Stay indoors for now", 3),
    pregnant: V("Stay indoors for now if you can.", "Stay indoors for now", 3),
    heart_lung: V("Stay indoors for now if you can.", "Stay indoors for now", 3),
    exercising: V("Move your workout indoors.", "Work out indoors", 2),
    outdoor_worker: V("Take regular breaks indoors. Ask about lighter outdoor tasks.", "Take regular indoor breaks", 2),
  },
  very_high: {
    general: V("Stay indoors for now. Go out only if you need to.", "Stay indoors for now", 3),
    kids: V("Keep kids indoors for now.", "Kids indoors for now", 4),
    elderly: V("Stay indoors for now.", "Stay indoors for now", 4),
    pregnant: V("Stay indoors for now.", "Stay indoors for now", 4),
    heart_lung: V("Stay indoors for now.", "Stay indoors for now", 4),
    exercising: V("Skip outdoor exercise for now.", "No outdoor exercise", 3),
    outdoor_worker: V("Limit time outside for now. Ask about indoor work.", "Limit time outside", 3),
  },
};

export interface Verdict {
  /** Main-screen headline (COPY §2 long form). */
  headline: string;
  /** ≤28 chars, no full stop: widgets, notification titles. */
  short: string;
  /** Optional second line under the headline (COPY §2), or null. */
  secondLine: string | null;
  /** "For you + kids" */
  forWhom: string;
  /** Which profile's wording was used. */
  profile: Profile;
  sensitive: boolean;
}

export interface VerdictOptions {
  stale?: boolean;
  observedAt?: string;
  /** Hourly history (oldest→newest) for the "Easing since {peakTime}" rule. */
  history?: readonly HistoryPoint[];
}

/** Verdict for a band and (multi-select) profile. Mixed profile → strictest row; ties by COPY priority. */
export function verdict(
  band: Band,
  profile: readonly Profile[] = ["general"],
  trend?: Trend | null,
  opts: VerdictOptions = {},
): Verdict {
  const ids = normaliseProfile(profile);
  const row = VERDICTS[band];
  let pick: Profile = ids[0];
  for (const p of TIE_BREAK) {
    if (!ids.includes(p)) continue;
    if (row[p].level > row[pick].level || (row[p].level === row[pick].level && TIE_BREAK.indexOf(p) < TIE_BREAK.indexOf(pick))) pick = p;
  }
  return {
    headline: row[pick].long,
    short: row[pick].short,
    secondLine: secondLine(band, trend ?? null, opts),
    forWhom: forWhom(ids),
    profile: pick,
    sensitive: isSensitive(ids),
  };
}

/** COPY §2 "Second line": first rule that applies, else null. */
export function secondLine(band: Band, trend: Trend | null, opts: VerdictOptions = {}): string | null {
  if (opts.stale) return `Reading is from ${opts.observedAt ? formatSgtTime(opts.observedAt) : "earlier"}. It may not match the air now.`;
  const elevatedPlus = band !== "normal";
  if (trend && trend.delta >= 20) return elevatedPlus ? "Getting worse. Check again in an hour." : "Rising quickly. Check again in an hour.";
  if (trend && trend.delta <= -20 && elevatedPlus) return "Getting better. Check again in an hour.";
  if (elevatedPlus && opts.history) {
    const peak = easingPeak(opts.history);
    if (peak) return `Easing since ${formatSgtTime(peak)}.`;
  }
  return null;
}

/** If the last 2+ hourly steps were falling, the time of the peak they fell from. */
export function easingPeak(history: readonly HistoryPoint[]): string | null {
  const n = history.length;
  if (n < 3) return null;
  const consecutive = (a: HistoryPoint, b: HistoryPoint) => Date.parse(b.time) - Date.parse(a.time) === 3600_000;
  let i = n - 1;
  let falls = 0;
  while (i > 0 && consecutive(history[i - 1], history[i]) && history[i].pm25 < history[i - 1].pm25) {
    falls++;
    i--;
  }
  return falls >= 2 ? history[i].time : null;
}

/* ------------------------------------------------------------------ band chip + anchor (COPY §3) */

export const BAND_ANCHORS: Record<Band, string> = {
  normal: "Normal is up to 55.",
  elevated: "Elevated band (56–150). High starts at 151.",
  high: "High band (151–250). Very High starts at 251.",
  very_high: "Very High band (251 and above).",
};

/** "Where you sit" line under the big number (replaces "N× a typical day"). */
export function bandAnchor(band: Band): string {
  return BAND_ANCHORS[band];
}

/* ------------------------------------------------------------------ actions (COPY §5) */

const A = {
  inhaler: "Asthma or COPD? Keep your inhaler with you.",
  run: "Shorten or slow your run, or move it indoors.",
  calmPlay: "Swap running games for calm play for now.",
  closeSensitive: "At home? Close the windows. Use a fan or aircon to keep cool.",
  checkHere: "Haze isn't always easy to see. Check here before a long run.",
  closeWindows: "Close windows. Use aircon or a fan to keep cool.",
  purifier: "Run a purifier in the room you're in, if you have one.",
  exerciseIndoors: "Move exercise indoors, or try later.",
  medicine: "Keep your inhaler or medicine close. Follow your doctor's plan.",
  indoorPlay: "Plan indoor play. Keep trips out short.",
  n95: "Out for hours? An N95 mask helps. Not needed for short trips.",
  n95Kids: "N95 masks aren't made for children. Keeping kids indoors works better.",
  n95Pregnant: "Pregnant? Wear an N95 only for short periods, and take it off if it feels hard to breathe.",
  n95HeartLung: "Heart or lung condition? Ask your doctor before using an N95.",
  checkOlder: "Check on older family and neighbours.",
  unwell: "Feeling unwell? See a doctor. Chest pain or can't breathe: call 995.",
  // outdoor_worker: not yet in COPY.md, wording ours.
  workerBreaks: "Take breaks in the shade or indoors, and drink water.",
  workerAsk: "Ask your supervisor about indoor breaks and lighter tasks.",
} as const;

export const CALM_LINE = "Enjoy the fresh air.";
export const CLEARED_LINE = "Air's cleared. Good time to open the windows.";
export const PLANNING_LINE = "Planning for tomorrow? Use NEA's 24-hr PSI forecast. Schools and events plan with it.";
/** NEA's haze site: 24-hr PSI forecast and advisory, for planning ahead (SPEC v1.2 §10). */
export const NEA_FORECAST_URL = "https://www.haze.gov.sg/";

/** Mask line for this profile, or null. Masks are never the lead action; never N95 for kids. */
function maskLine(ids: Profile[]): string | null {
  if (ids.includes("kids")) return A.n95Kids;
  if (ids.includes("heart_lung")) return A.n95HeartLung;
  if (ids.includes("pregnant")) return A.n95Pregnant;
  return A.n95;
}

/**
 * Actions for a band, filtered by profile, most useful first (COPY §5). Normal → [] (show CALM_LINE).
 * `max` defaults to 3. Masks are never first; kids never get an N95 suggestion.
 */
export function actions(band: Band, profile: readonly Profile[] = ["general"], max = 3): string[] {
  const ids = normaliseProfile(profile);
  const has = (p: Profile) => ids.includes(p);
  const list: string[] = [];
  if (band === "normal") return [];
  if (band === "elevated") {
    if (has("heart_lung")) list.push(A.inhaler);
    if (has("exercising")) list.push(A.run);
    if (has("kids")) list.push(A.calmPlay);
    if (has("outdoor_worker")) list.push(A.workerBreaks);
    if (isSensitive(ids)) list.push(A.closeSensitive);
    if (has("general")) list.push(A.checkHere);
    if (list.length === 0) list.push(A.closeSensitive);
    return list.slice(0, max);
  }
  // High and Very High
  const profileSpecific: string[] = [];
  if (has("exercising") || has("general")) profileSpecific.push(A.exerciseIndoors);
  if (has("heart_lung")) profileSpecific.push(A.medicine);
  if (has("kids")) profileSpecific.push(A.indoorPlay);
  if (has("outdoor_worker")) profileSpecific.push(A.workerAsk);
  const mask = maskLine(ids);
  if (band === "high") {
    list.push(A.closeWindows, A.purifier, ...profileSpecific);
    if (mask) list.push(mask);
    return dedupe(list).slice(0, max);
  }
  // Very High: all High actions + check on older family + unwell/995, which always stays in view.
  list.push(A.closeWindows, ...profileSpecific, A.purifier, A.checkOlder);
  if (mask) list.push(mask);
  const head = dedupe(list).slice(0, Math.max(0, max - 1));
  return [...head, A.unwell];
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Normal-band line: "Air's cleared…" in the first 3 h back at Normal after an episode, else "Enjoy the fresh air." */
export function calmLine(history: readonly HistoryPoint[]): string {
  const n = history.length;
  if (n >= 2 && history[n - 1].pm25 <= 55) {
    const tEnd = Date.parse(history[n - 1].time);
    const recent = history.filter((h) => tEnd - Date.parse(h.time) <= 3 * 3600_000 && tEnd - Date.parse(h.time) > 0);
    if (recent.some((h) => h.pm25 > 55)) return CLEARED_LINE;
  }
  return CALM_LINE;
}

/* ------------------------------------------------------------------ typical day (detail sheet only) */

export interface TypicalAnchor {
  typical: number;
  multiple: number;
  /** "A usual clear day in Singapore is around 20." */
  text: string;
}

/**
 * Typical clear-day PM2.5: median of history if it spans ≥7 days (≥168 points), else 20.
 * v1.2: NOT shown on the main screen; only the detail-sheet line uses it.
 */
export function typicalMultiple(pm25: number, history: readonly (HistoryPoint | number)[] = []): TypicalAnchor {
  const vals = history.map((h) => (typeof h === "number" ? h : h.pm25)).filter(isValidReading);
  const typical = vals.length >= 168 ? Math.max(1, roundHalfUp(median(vals))) : TYPICAL_PM25;
  const raw = pm25 / typical;
  const multiple = raw < 2 ? Math.round(raw * 10) / 10 : roundHalfUp(raw);
  return { typical, multiple, text: `A usual clear day in Singapore is around ${typical}.` };
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ------------------------------------------------------------------ uncertainty (COPY §6) */

export interface Uncertainty {
  /** Blended/estimated value (never shown as "~" on the number, SPEC v1.5; use `line`). */
  approx: boolean;
  /** [lo, hi] of the two nearest valid stations (or all online stations in island mode), or null. */
  range: [number, number] | null;
  /** "Nearby stations read 83–117." or null */
  text: string | null;
  /** Screen-reader phrasing: "about 105, nearby stations read 83 to 117" */
  a11y: string;
}

/**
 * - region mode with a live reading: a measurement → exact.
 * - island fallback: estimate, range = min–max of online stations.
 * - gps: exact if snapped (<0.5 km). Otherwise an estimate; add the range of the two nearest valid stations when
 *   the nearest is > 5 km away or the two differ by more than 30.
 */
export function uncertainty(s: Pick<Snapshot, "pm25" | "regions" | "locationMode">, point?: LatLon | null): Uncertainty {
  const exact = (): Uncertainty => ({ approx: false, range: null, text: null, a11y: String(s.pm25) });
  const approx = (range: [number, number] | null): Uncertainty => ({
    approx: true,
    range: range && range[0] !== range[1] ? range : null,
    text: range && range[0] !== range[1] ? `Nearby stations read ${range[0]}–${range[1]}.` : null,
    a11y: `about ${s.pm25}${range && range[0] !== range[1] ? `, nearby stations read ${range[0]} to ${range[1]}` : ""}`,
  });
  const valid = Object.entries(s.regions).filter(([, r]) => isValidReading(r.pm25)) as [string, RegionReading & { pm25: number }][];
  if (s.locationMode === "region") return exact();
  if (s.locationMode === "island" || !point) {
    if (valid.length === 0) return approx(null);
    const vs = valid.map(([, r]) => r.pm25);
    return approx([Math.min(...vs, s.pm25), Math.max(...vs, s.pm25)]);
  }
  const near = valid
    .map(([name, r]) => ({ name, v: r.pm25, d: haversineKm(point, { lat: r.lat, lon: r.lon }) }))
    .sort((a, b) => a.d - b.d);
  if (near.length === 0) return approx(null);
  if (near[0].d < SNAP_KM) return exact();
  const [a, b] = near;
  const far = a.d > UNCERTAIN_KM;
  const disagree = !!b && Math.abs(a.v - b.v) > DISAGREE_UGM3;
  if (!far && !disagree) return approx(null);
  return approx(stationRange(near, s.pm25));
}

/**
 * SPEC v1.7 range rule: min/max over valid stations within 1.5× the nearest station's distance
 * (always at least the two nearest), then widened to include the estimate itself.
 */
export function stationRange(near: readonly { v: number; d: number }[], estimate: number): [number, number] {
  const limit = near[0].d * 1.5;
  const pool = near.filter((n, i) => i < 2 || n.d <= limit).map((n) => n.v);
  return [Math.min(...pool, estimate), Math.max(...pool, estimate)];
}

/** The hero number is always a clean integer (SPEC v1.5): no "~". Kept for API compatibility. */
export function formatWithUncertainty(value: number, _u?: Uncertainty): string {
  return String(value);
}

/**
 * The small line under the hero number (SPEC v1.5 §1):
 *   "Measured at East station"                (region mode, or GPS within 0.5 km of a station)
 *   "Estimate for Tampines · range 83–117"    (area/GPS blend; range only when uncertain)
 *   "Estimate for your spot"                  (GPS blend, no place name)
 *   "Island average · range 49–117"           (island view)
 *   "Average of other stations · range 49–117" (picked region's station offline)
 */
export function uncertaintyLine(
  s: Pick<Snapshot, "pm25" | "regions" | "locationMode" | "nearestRegion">,
  point?: LatLon | null,
  opts: { placeName?: string } = {},
): string {
  const u = uncertainty(s, point);
  const range = u.range ? ` · range ${u.range[0]}–${u.range[1]}` : "";
  if (!u.approx) return `Measured at ${regionLabel(s.nearestRegion)} station`;
  if (s.locationMode === "island") return `${s.nearestRegion ? "Average of other stations" : "Island average"}${range}`;
  return `Estimate for ${opts.placeName ?? "your spot"}${range}`;
}

/* ------------------------------------------------------------------ provenance (COPY §6) */

/** "just now" (<5 min), "{n} min ago", "1 h 10 min ago". */
export function formatAge(minutes: number): string {
  if (minutes < 5) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 48) return m ? `${h} h ${m} min ago` : `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function km(d: number): string {
  return d < 10 ? d.toFixed(1) : String(Math.round(d));
}

export interface Provenance {
  /** Main line without the age, e.g. "NEA West station · measured 4pm" */
  text: string;
  /** " · 35 min ago" style suffix, kept separate so a UI can tick it every minute */
  age: string;
  /** text + " · " + age */
  full: string;
  station: string;
  distanceKm: number | null;
  minutesAgo: number;
  /** "{Region} station is offline. Using nearby stations." (GPS, when the closest station is down) */
  note: string | null;
  /** "Measured 4pm · posted by NEA 4:30pm" (detail sheet) */
  detail: string;
}

export interface ProvenanceOptions {
  /** Place label for point mode: "Tampines", "Home". Default "Near you" (device location). */
  placeName?: string;
}

/**
 * Provenance line (COPY §6 as amended by SPEC v1.4 §4):
 *   device location: "Near you · West station 3.2 km · measured 4pm"
 *   picked area:     "Tampines · East station 1.1 km · measured 4pm"
 *   region:          "NEA West station · measured 4pm"
 *   island view:     "Singapore (island average) · measured 4pm"
 *   region offline:  "West station is offline. Showing the average of NEA's other stations."
 */
export function provenance(
  s: Pick<Snapshot, "regions" | "locationMode" | "nearestRegion" | "observedAt" | "publishedAt">,
  point?: LatLon | null,
  now: Date | number = Date.now(),
  opts: ProvenanceOptions = {},
): Provenance {
  const t = typeof now === "number" ? now : now.getTime();
  const mins = Math.max(0, Math.round((t - Date.parse(s.observedAt)) / 60_000));
  const age = formatAge(mins);
  const obs = formatSgtTime(s.observedAt);
  const R = s.nearestRegion ? regionLabel(s.nearestRegion) : "";
  let text: string;
  let note: string | null = null;
  let distanceKm: number | null = null;

  if (s.locationMode === "gps" && point) {
    const r = s.regions[s.nearestRegion];
    distanceKm = r ? haversineKm(point, { lat: r.lat, lon: r.lon }) : null;
    const dist = distanceKm === null ? "" : ` ${km(distanceKm)} km`;
    text = `${opts.placeName ?? "Near you"} · ${R} station${dist} · measured ${obs}`;
    let closest: string | null = null;
    let best = Infinity;
    for (const [name, rr] of Object.entries(s.regions)) {
      const d = haversineKm(point, { lat: rr.lat, lon: rr.lon });
      if (d < best) {
        best = d;
        closest = name;
      }
    }
    if (closest && closest !== s.nearestRegion && !isValidReading(s.regions[closest]?.pm25)) {
      note = `${regionLabel(closest)} station is offline. Using nearby stations.`;
    }
  } else if (s.locationMode === "island") {
    text = s.nearestRegion
      ? `${R} station is offline. Showing the average of NEA's other stations.`
      : `Singapore (island average) · measured ${obs}`;
  } else {
    text = `NEA ${R} station · measured ${obs}`;
  }
  return {
    text,
    age,
    full: `${text} · ${age}`,
    station: s.nearestRegion,
    distanceKm,
    minutesAgo: mins,
    note,
    detail: `Measured ${obs} · posted by NEA ${formatSgtTime(s.publishedAt)}`,
  };
}

/* ------------------------------------------------------------------ trend (COPY §4) */

export type TrendWord = "steady" | "rising" | "rising fast" | "easing" | "clearing fast";

function hourBefore(history: readonly HistoryPoint[], hours: number): HistoryPoint | undefined {
  const last = history[history.length - 1];
  const t = Date.parse(last.time) - hours * 3600_000;
  return history.find((h) => Date.parse(h.time) === t);
}

function wordFor(d: number): TrendWord {
  if (d >= 20) return "rising fast";
  if (d >= 5) return "rising";
  if (d <= -20) return "clearing fast";
  if (d <= -5) return "easing";
  return "steady";
}

/** Accessibility trend word, or null when there is no previous hour. */
export function trendWord(history: readonly HistoryPoint[]): TrendWord | null {
  if (history.length < 2) return null;
  const h1 = hourBefore(history, 1);
  if (!h1) return null;
  return wordFor(history[history.length - 1].pm25 - h1.pm25);
}

/**
 * Trend phrase: "Steady over the last hour", "Rising: up 8 in the last hour", "Rising fast: up 38 in 2 hours",
 * "Easing: down 12 in the last hour", "Clearing fast: down 25 in the last hour", "Trend not available yet".
 * The 2-hour variant is used when the 2-h change is bigger and in the same direction.
 */
export function trendWords(history: readonly HistoryPoint[]): string {
  if (history.length < 2) return "Trend not available yet";
  const latest = history[history.length - 1];
  const h1 = hourBefore(history, 1);
  if (!h1) return "Trend not available yet";
  const d1 = latest.pm25 - h1.pm25;
  const h2 = hourBefore(history, 2);
  const d2 = h2 ? latest.pm25 - h2.pm25 : null;
  const w1 = wordFor(d1);
  if (w1 === "steady") return "Steady over the last hour";
  let d = d1;
  let span = "in the last hour";
  if (d2 !== null && Math.sign(d2) === Math.sign(d1) && Math.abs(d2) > Math.abs(d1)) {
    d = d2;
    span = "in 2 hours";
  }
  const w = wordFor(d);
  const label = { rising: "Rising", "rising fast": "Rising fast", easing: "Easing", "clearing fast": "Clearing fast", steady: "Steady" }[w];
  return d > 0 ? `${label}: up ${d} ${span}` : `${label}: down ${Math.abs(d)} ${span}`;
}

/* ------------------------------------------------------------------ accessibility */

/** "OK to be out. Go easy on hard exercise. For you. PM2.5 105, Elevated, rising." (COPY §2) */
export function headlineLabel(
  s: Pick<Snapshot, "pm25" | "band" | "trend" | "history">,
  profile: readonly Profile[] = ["general"],
): string {
  const v = verdict(s.band, profile, s.trend);
  const w = trendWord(s.history);
  return `${v.headline} ${v.forWhom}. PM2.5 ${s.pm25}, ${bandInfo(s.band).label}${w ? `, ${w}` : ""}.`;
}

/** Compact a11y: "PM2.5 105, Elevated, rising, measured 4pm" (COPY §16). */
export function accessibleLabel(s: Pick<Snapshot, "pm25" | "band" | "trend"> & Partial<Pick<Snapshot, "history" | "observedAt">>): string {
  const w = s.history ? trendWord(s.history) : ({ up: "rising", down: "easing", steady: "steady" } as const)[s.trend.direction];
  return `PM2.5 ${s.pm25}, ${bandInfo(s.band).label}${w ? `, ${w}` : ""}${s.observedAt ? `, measured ${formatSgtTime(s.observedAt)}` : ""}`;
}

/* ------------------------------------------------------------------ official figure + explainer (COPY §6, §7, §8) */

/** "NEA 24-hr PSI: 84 (Moderate)" / "NEA 24-hr PSI: not available right now". No "lagging". */
export function officialPsiLabel(psi: number | null, descriptor: (n: number) => string): string {
  return psi === null ? "NEA 24-hr PSI: not available right now" : `NEA 24-hr PSI: ${psi} (${descriptor(psi)})`;
}
export const OFFICIAL_CAPTION = "24-hour average";
export const WHY_TWO_NUMBERS_LINK = "Why two numbers?";
export const WHY_TWO_NUMBERS =
  "NEA's 24-hr PSI is an average of the last 24 hours, so it changes slowly and is best for planning tomorrow. The 1-hr PM2.5 shows the last hour, and NEA recommends it for deciding what to do right now.";
export const WHY_TWO_NUMBERS_SHORT = "Both are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour.";
export const PRIVACY_LINE = "Your location stays on your device. We never send it anywhere.";
export const FOOTER_LINE = "Data: NEA via data.gov.sg · Free & open source · No ads, no tracking, no account";

export const CHART_COPY = {
  title: "Last 24 hours",
  legendBars: "Bars: hourly PM2.5 at your spot",
  /** COPY §8 says "Line: NEA 24-hr PSI", but SPEC v1.2 §2 plots NEA's 24-hr PM2.5 average in µg/m³; label says what is drawn. */
  legendLine: "Line: NEA 24-hr average PM2.5",
  caption: "The line moves slowly because it averages a whole day. The bars show each hour.",
  guideHigh: "High 151",
  guideElevated: "Elevated 56",
} as const;

/** COPY §8 accessibility summary. */
export function chartSummary(history: readonly HistoryPoint[]): string {
  if (history.length === 0) return "Chart. No readings yet.";
  const first = history[0];
  const last = history[history.length - 1];
  const max = history.reduce((m, h) => (h.pm25 > m.pm25 ? h : m), first);
  const line = history.filter((h) => typeof h.psi24h === "number");
  const psiPart = line.length >= 2 ? ` NEA 24-hr PSI went from ${line[0].psi24h} to ${line[line.length - 1].psi24h}.` : "";
  return `Chart. Over the last 24 hours PM2.5 went from ${first.pm25} to ${last.pm25}, peaking at ${max.pm25} at ${formatSgtTime(max.time)}.${psiPart}`;
}
