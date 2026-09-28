/** Time + text helpers. Deterministic: Singapore is UTC+8 with no DST, so no Intl needed. */
import { bandInfo, TREND_ARROWS } from "./math.js";
import type { Snapshot } from "./types.js";

const SGT_OFFSET_MS = 8 * 3600_000;
const MIN = 60_000;

function sgt(d: Date | number | string): Date {
  const t = typeof d === "string" ? Date.parse(d) : typeof d === "number" ? d : d.getTime();
  return new Date(t + SGT_OFFSET_MS);
}

/** "YYYY-MM-DD" of the given instant in Singapore time. */
export function sgtDate(d: Date | number = Date.now()): string {
  return sgt(d).toISOString().slice(0, 10);
}

/** "4pm", "4:30pm", "12am" in Singapore time. */
export function formatSgtTime(d: Date | number | string): string {
  const s = sgt(d);
  const h24 = s.getUTCHours();
  const m = s.getUTCMinutes();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? "am" : "pm";
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

const HOUR = 3600_000;
const SEC = 1000;

/**
 * Next poll delay (SPEC v1.3). NEA publishes ~1 min after the hour.
 * - From hh:00:30 until the new hour appears (latest `observedAt` < this hour), poll every 60 s, up to hh:10.
 * - Otherwise wake at the next of hh:35 and hh:50 (v2 back-fill checks) and the next hour's hh:00:30.
 * Singapore has a whole-hour UTC offset, so hour boundaries are the same in UTC.
 */
export function nextPollDelayMs(now: Date | number = Date.now(), observedAt?: string | null): number {
  const t = typeof now === "number" ? now : now.getTime();
  const hourStart = Math.floor(t / HOUR) * HOUR;
  const into = t - hourStart;
  const haveThisHour = !!observedAt && Date.parse(observedAt) >= hourStart;
  if (!haveThisHour && into < 10 * MIN) {
    if (into < 30 * SEC) return hourStart + 30 * SEC - t;
    return 60 * SEC;
  }
  const targets = [hourStart + 35 * MIN, hourStart + 50 * MIN, hourStart + HOUR + 30 * SEC];
  const next = targets.find((x) => x > t)!;
  return Math.max(SEC, next - t);
}

/** Whether a v2 back-fill call is due: never called yet, or an hh:35 / hh:50 mark has passed since the last call. */
export function shouldFetchV2(now: number, lastAt: number | null): boolean {
  if (lastAt === null) return true;
  if (now - lastAt >= HOUR) return true;
  if (now - lastAt < MIN) return false; // never more than 1 req/min per endpoint
  for (let h = Math.floor(lastAt / HOUR) * HOUR; h <= now; h += HOUR) {
    for (const m of [35, 50]) {
      const mark = h + m * MIN;
      if (mark > lastAt && mark <= now) return true;
    }
  }
  return false;
}

/** Exponential backoff 30 s → 10 min (attempt 0 = 30 s), honouring Retry-After (seconds) within those bounds. */
export function backoffMs(attempt: number, retryAfterSec?: number): number {
  const min = 30 * SEC;
  const max = 10 * MIN;
  if (retryAfterSec && retryAfterSec > 0) return Math.min(max, Math.max(min, retryAfterSec * SEC));
  return Math.min(max, min * 2 ** Math.max(0, attempt));
}

/** Widgets/timelines: ask the OS to refresh at the next hh:02 (SPEC v1.3). */
export function nextWidgetRefreshAt(now: Date | number = Date.now()): number {
  const t = typeof now === "number" ? now : now.getTime();
  const mark = Math.floor(t / HOUR) * HOUR + 2 * MIN;
  return mark > t ? mark : mark + HOUR;
}

export const REGION_LABELS: Record<string, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
  central: "Central",
};

export function regionLabel(name: string): string {
  return REGION_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

/** Short place label: "South", "Near West" (gps), "Island avg". */
export function placeLabel(s: Snapshot): string {
  if (s.locationMode === "gps") return `Near ${regionLabel(s.nearestRegion)}`;
  if (s.locationMode === "island") return "Singapore";
  return regionLabel(s.nearestRegion);
}

/** Phrase for sentences: "in the West", "in Central", "near you", "across Singapore". */
export function placePhrase(s: Snapshot): string {
  if (s.locationMode === "gps") return "near you";
  if (s.locationMode === "island") return "across Singapore";
  return s.nearestRegion === "central" ? "in Central" : `in the ${regionLabel(s.nearestRegion)}`;
}

export function trendArrow(s: Snapshot): string {
  return TREND_ARROWS[s.trend.direction];
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
}

/** Compact surfaces: "● 105 ▲". */
export function compactText(s: Snapshot): string {
  return `● ${s.pm25} ${trendArrow(s)}`;
}

/** "in the West" / "near me" / "in Singapore" (share text). */
export function shareArea(s: Snapshot): string {
  if (s.locationMode === "gps") return "near me";
  if (s.locationMode === "island") return "in Singapore";
  return s.nearestRegion === "central" ? "in Central" : `in the ${regionLabel(s.nearestRegion)}`;
}

function trendWordOf(s: Snapshot): string | null {
  const h = s.history;
  if (h.length < 2) return null;
  const last = h[h.length - 1];
  const prev = h.find((p) => Date.parse(p.time) === Date.parse(last.time) - 3600_000);
  if (!prev) return null;
  const d = last.pm25 - prev.pm25;
  return d >= 20 ? "rising fast" : d >= 5 ? "rising" : d <= -20 ? "clearing fast" : d <= -5 ? "easing" : "steady";
}

/**
 * Share text (COPY §15): no verdict, no Instant PSI.
 * "Air near me right now: Elevated (PM2.5 105), rising. NEA 24-hr PSI: 84. Data: NEA via data.gov.sg. hazenow.pages.dev"
 * COPY fixes "near me"; in region mode we say "in the West" so the recipient isn't misled about where.
 */
export function shareText(s: Snapshot, shareUrl = "hazenow.pages.dev", opts: { placeName?: string } = {}): string {
  const band = bandInfo(s.band).label;
  const w = trendWordOf(s);
  const psi = s.officialPsi24h === null ? "" : ` NEA 24-hr PSI: ${s.officialPsi24h}.`;
  const area = opts.placeName ? `in ${opts.placeName}` : shareArea(s);
  return `Air ${area} right now: ${band} (PM2.5 ${s.pm25})${w ? `, ${w}` : ""}.${psi} Data: NEA via data.gov.sg. ${shareUrl}`;
}

/** One-line plain text summary (the CLI adds colour on top). No Instant PSI (SPEC v1.2 §1). */
export function summaryLine(s: Snapshot): string {
  const band = bandInfo(s.band).label;
  const parts = [
    `● PM2.5 ${s.pm25} µg/m³ ${band} ${trendArrow(s)}${s.trend.direction === "steady" ? "" : signed(s.trend.delta)}`,
    `NEA 24-hr PSI ${s.officialPsi24h ?? "–"}`,
    placeLabel(s),
    `as of ${formatSgtTime(s.observedAt)}${s.stale ? " (old)" : ""}`,
  ];
  return parts.join(" · ");
}
