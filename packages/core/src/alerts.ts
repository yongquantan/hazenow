/**
 * Band-crossing alerts (SPEC v1.1 §10, v1.2 §7, COPY §11): a pure state machine, a TypeScript port of the native
 * apps' rules (apps/android/core/.../Alerts.kt, apps/apple/HazeKit/.../HazeAlerts.swift). The data server's Web
 * Push alerts (services/worker/src/push.ts) use it, so a web subscriber gets the same messages as the apps.
 *
 * - Band crossings only, confirmed by hysteresis: 2 consecutive hours across the boundary, or ≥10 µg/m³ past it.
 * - Rises to High or above for everyone; to Elevated for sensitive, exercise and outdoor-work profiles by default
 *   (opt-in for general-only).
 * - Easing and the all-clear only follow an alert sent this episode. The all-clear always gets through the cap.
 * - At most 3 other notifications a day (SGT).
 * - Quiet hours 22:00–07:00 SGT: nothing is sent; rises are remembered and summed up in one morning catch-up.
 * - The first evaluation adopts the current band silently, and a stale reading never alerts.
 *
 * Where the two native apps differ, this follows the stricter, newer rule: Android's (easing, all-clear and the
 * morning catch-up only after an alert this episode or for a band you'd be alerted about), and the Apple app's and
 * Telegram bot's default for "I work outdoors" (Elevated on by default, as hours outside are exposure).
 */
import { bandInfo } from "./math.js";
import { normaliseProfile, trendWord, verdict, isSensitive, type Profile } from "./experience.js";
import { regionLabel, sgtDate } from "./format.js";
import type { Band, HistoryPoint, Snapshot } from "./types.js";

export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 7;
export const DAILY_CAP = 3;
export const HYSTERESIS_UG = 10;

const ORDER: Band[] = ["normal", "elevated", "high", "very_high"];
const rank = (b: Band) => ORDER.indexOf(b);
const LOWER: Record<Band, number> = { normal: 0, elevated: 56, high: 151, very_high: 251 };
const UPPER: Record<Band, number> = { normal: 55, elevated: 150, high: 250, very_high: Infinity };
const bandOf = (pm25: number): Band => (pm25 <= 55 ? "normal" : pm25 <= 150 ? "elevated" : pm25 <= 250 ? "high" : "very_high");
const label = (b: Band) => bandInfo(b).label;

/** Persisted per subscriber. Every field is optional so an empty object is a valid first state. */
export interface AlertState {
  /** Last confirmed band (after hysteresis). Absent = never evaluated. */
  band?: Band | null;
  /** A rise alert was sent this episode, so easing and an all-clear are owed. */
  episodeAlerted?: boolean;
  /** SGT date of `sentToday`. */
  day?: string;
  /** Non-all-clear notifications sent on `day`. */
  sentToday?: number;
  /** Highest band reached while quiet hours held notifications back. */
  overnightPeak?: Band | null;
}

export interface AlertPrefs {
  profiles?: readonly string[];
  /** null/absent = COPY §11 default: on for sensitive, exercise and outdoor-work profiles, off for general-only. */
  elevated?: boolean | null;
  quietStart?: number;
  quietEnd?: number;
  /** A named place ("Tampines") → "in Tampines". Otherwise the snapshot's mode decides. */
  placeName?: string | null;
}

export type AlertKind = "rising" | "easing" | "allClear" | "morning";

export interface BandAlert {
  kind: AlertKind;
  title: string;
  body: string;
}

export interface AlertOutcome {
  state: AlertState;
  alert: BandAlert | null;
}

/** Would a crossing to Elevated be announced for these prefs? */
export function elevatedEnabled(prefs: AlertPrefs): boolean {
  if (typeof prefs.elevated === "boolean") return prefs.elevated;
  const ids = normaliseProfile(prefs.profiles);
  return isSensitive(ids) || ids.includes("exercising") || ids.includes("outdoor_worker");
}

/** Quiet hours, SGT. Handles windows that wrap midnight; start === end means none. */
export function inQuietHours(now: Date | number, start = QUIET_START_HOUR, end = QUIET_END_HOUR): boolean {
  if (start === end) return false;
  const t = typeof now === "number" ? now : now.getTime();
  const h = new Date(t + 8 * 3600_000).getUTCHours();
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** COPY §11 `{area}`: "in Tampines", "near you", "in the West", "islandwide". */
export function areaPhrase(s: Pick<Snapshot, "locationMode" | "nearestRegion">, placeName?: string | null): string {
  if (placeName) return `in ${placeName}`;
  if (s.locationMode === "gps") return "near you";
  if (s.locationMode === "region") return `in the ${regionLabel(s.nearestRegion)}`;
  return "islandwide";
}

/** The band confirmed by hysteresis, starting from `confirmed`. `history` = hourly points, oldest → newest. */
export function confirmedBand(confirmed: Band, history: readonly Pick<HistoryPoint, "pm25">[]): Band {
  const latest = history[history.length - 1];
  if (!latest) return confirmed;
  const v = latest.pm25;
  const cur = bandOf(v);
  if (cur === confirmed) return confirmed;
  const above = v > UPPER[confirmed];
  const margin = above ? v - UPPER[confirmed] : LOWER[confirmed] - v;
  const prev = history.length >= 2 ? history[history.length - 2].pm25 : null;
  const prevSameSide = prev !== null && (above ? prev > UPPER[confirmed] : prev < LOWER[confirmed]);
  return margin >= HYSTERESIS_UG || prevSameSide ? cur : confirmed;
}

function wantsRise(to: Band, prefs: AlertPrefs): boolean {
  if (to === "normal") return false;
  if (to === "elevated") return elevatedEnabled(prefs);
  return true;
}

/** Advance the state machine with a new snapshot. Returns the next state and at most one alert. */
export function evaluateAlert(prev: AlertState, s: Snapshot, prefs: AlertPrefs = {}, now: Date | number = Date.now()): AlertOutcome {
  const today = sgtDate(now);
  let st: AlertState = prev.day === today ? { ...prev } : { ...prev, day: today, sentToday: 0 };
  const sent = () => st.sentToday ?? 0;
  if (!prev.band) return { state: { ...st, band: s.band }, alert: null }; // first run: adopt silently
  if (s.stale) return { state: st, alert: null };

  const old = prev.band;
  const cur = confirmedBand(old, s.history.length ? s.history : [{ pm25: s.pm25 }]);
  const quiet = inQuietHours(now, prefs.quietStart ?? QUIET_START_HOUR, prefs.quietEnd ?? QUIET_END_HOUR);
  const profiles: Profile[] = normaliseProfile(prefs.profiles);
  const v = verdict(s.band, profiles).headline;
  const area = areaPhrase(s, prefs.placeName);
  const pm = s.pm25;

  // Morning catch-up for anything held back overnight.
  if (!quiet && st.overnightPeak) {
    const peak = st.overnightPeak;
    st = { ...st, band: cur, overnightPeak: null };
    if (wantsRise(peak, prefs) && sent() < DAILY_CAP) {
      const word = trendWord(s.history) ?? "steady";
      return {
        state: { ...st, sentToday: sent() + 1, episodeAlerted: cur !== "normal" },
        alert: { kind: "morning", title: "Overnight air update", body: `The haze reached ${label(peak)} overnight. Now: ${label(s.band)}, PM2.5 ${pm}, ${word}. ${v}` },
      };
    }
    if (cur === "normal") st = { ...st, episodeAlerted: false };
    return { state: st, alert: null };
  }

  if (cur === old) return { state: st, alert: null };
  st = { ...st, band: cur };

  if (quiet) {
    if (rank(cur) <= rank(old)) return { state: st, alert: null };
    const peak = st.overnightPeak && rank(st.overnightPeak) > rank(cur) ? st.overnightPeak : cur;
    return { state: { ...st, overnightPeak: peak }, alert: null };
  }

  let alert: BandAlert | null = null;
  if (cur === "normal") {
    if (st.episodeAlerted) {
      const g = verdict("normal", profiles).profile;
      const tail = g === "kids" ? "Fine for outdoor play again." : g === "exercising" ? "Fine for your run." : "Fine to be out. Good time to open the windows.";
      alert = { kind: "allClear", title: `All clear ${area}`, body: `Air's back to Normal (PM2.5 ${pm}). ${tail}` };
    }
  } else if (rank(cur) > rank(old)) {
    if (wantsRise(cur, prefs) && sent() < DAILY_CAP) {
      alert =
        cur === "elevated"
          ? { kind: "rising", title: `Haze rising ${area}`, body: `Now Elevated (PM2.5 ${pm}). ${v}` }
          : cur === "high"
            ? { kind: "rising", title: `Haze now High ${area}`, body: `PM2.5 ${pm}. ${v} Close windows and keep cool with aircon or a fan.` }
            : { kind: "rising", title: `Haze now Very High ${area}`, body: `PM2.5 ${pm}. ${v} Check on older family.` };
    }
  } else if (st.episodeAlerted && sent() < DAILY_CAP) {
    alert = { kind: "easing", title: `Haze easing ${area}`, body: `Down to ${label(cur)} (PM2.5 ${pm}). ${v}` };
  }

  if (!alert) st = cur === "normal" ? { ...st, episodeAlerted: false } : st;
  else if (alert.kind === "allClear") st = { ...st, episodeAlerted: false };
  else st = { ...st, episodeAlerted: true, sentToday: sent() + 1 };
  return { state: st, alert };
}
