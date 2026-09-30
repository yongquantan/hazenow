/**
 * Verdict copy per jurisdiction (SPEC v2.0). Same grammar as COPY.md everywhere: verdict first, "for now",
 * calm, no banned words, every level ≥ 1 carries an action (actions come from experience.ts via `band`).
 *
 * - SG: COPY.md verbatim (experience.ts `verdict`).
 * - TH: the verdict follows the official 24-hr Thai AQI category (thailand.md §Index), words derived from PCD's
 *   own advice per category, split general / at-risk (ประชาชนทั่วไป / ประชาชนกลุ่มเสี่ยง). The 1-hr number is
 *   not banded; its "now" signal is carried by the second line. Thai strings: DRAFT, need native review.
 * - Other countries with a chip: COPY.md matrix through the level-mapped `band` until COPY.<cc>.md exists.
 * - No national scale (LA, KH, MM): no verdict headline; number + WHO line only (REGIONAL §3.3 rule 2).
 */
import { actions, normaliseProfile, isSensitive, forWhom, verdict as sgVerdict, type Profile, type Verdict } from "../experience.js";
import type { Trend } from "../types.js";
import { CHIP_SCALE, SCALES } from "./scales.js";
import type { CountryCode, CountrySnapshot } from "./types.js";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "4pm" / "4:30pm" in the timestamp's own zone (the station's local time, REGIONAL §3.5). */
export function formatLocalTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const h24 = Number(m[1]);
  const min = Number(m[2]);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${min ? `:${pad2(min)}` : ""}${h24 < 12 ? "am" : "pm"}`;
}

/** "16:00 น." (Thai style, 24-h clock). */
export function formatThaiTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]} น.` : iso;
}

/* ------------------------------------------------------------------ Thailand */

type ThGroup = "general" | "kids" | "sensitive" | "exercising" | "outdoor_worker";
type ThCell = { en: string; short: string; th: string; shortTh: string; strict: number };
const T = (en: string, short: string, th: string, shortTh: string, strict: number): ThCell => ({ en, short, th, shortTh, strict });

/** Keys are th_aqi band keys. `strict` orders cells for mixed profiles (strictest wins). */
export const THAI_VERDICTS: Record<string, Record<ThGroup, ThCell>> = {
  very_good: {
    general: T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
    kids: T("Fine for outdoor play.", "Fine for outdoor play", "เด็กเล่นกลางแจ้งได้ตามปกติ", "เล่นกลางแจ้งได้", 0),
    sensitive: T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
    exercising: T("Fine to exercise outside.", "Fine to exercise outside", "ออกกำลังกายกลางแจ้งได้ตามปกติ", "ออกกำลังกายกลางแจ้งได้", 0),
    outdoor_worker: T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
  },
  good: {
    general: T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
    kids: T("Fine for outdoor play. Watch for coughing.", "Fine, watch for coughs", "เด็กเล่นกลางแจ้งได้ สังเกตอาการไอ", "เล่นได้ สังเกตอาการไอ", 1),
    sensitive: T("Fine to be out. Watch for coughing or breathlessness.", "Fine, watch for symptoms", "ออกไปข้างนอกได้ สังเกตอาการไอหรือหายใจลำบาก", "ออกได้ สังเกตอาการ", 1),
    exercising: T("Fine to exercise outside.", "Fine to exercise outside", "ออกกำลังกายกลางแจ้งได้ตามปกติ", "ออกกำลังกายกลางแจ้งได้", 0),
    outdoor_worker: T("Fine to be out.", "Fine to be out", "ออกไปข้างนอกได้ตามปกติ", "ออกไปข้างนอกได้", 0),
  },
  moderate: {
    general: T("OK to be out. Cut back on long, hard exercise for now.", "Go easy outdoors", "ออกไปข้างนอกได้ ช่วงนี้ลดเวลาออกกำลังกายหนักกลางแจ้ง", "ลดกิจกรรมหนักกลางแจ้ง", 2),
    kids: T("Calm play outside is OK. Skip running games for now.", "Calm play only", "เล่นกลางแจ้งแบบเบาๆ ได้ งดวิ่งเล่นไปก่อน", "เล่นเบาๆ เท่านั้น", 3),
    sensitive: T("Gentle activity is OK. Skip hard exercise for now.", "Gentle activity only", "ทำกิจกรรมเบาๆ ได้ งดออกกำลังกายหนักไปก่อน", "กิจกรรมเบาๆ เท่านั้น", 3),
    exercising: T("Keep your workout shorter and lighter for now.", "Shorter, lighter workout", "ช่วงนี้ออกกำลังกายให้สั้นและเบาลง", "ออกกำลังกายให้เบาลง", 3),
    outdoor_worker: T("OK to work outside. Take breaks indoors if you can.", "Take breaks indoors", "ทำงานกลางแจ้งได้ พักในอาคารเมื่อทำได้", "พักในอาคารเป็นระยะ", 2),
  },
  starting_to_affect: {
    general: T("Short trips out are OK. Limit hard exercise outside.", "Limit outdoor exercise", "ออกไปข้างนอกระยะสั้นได้ จำกัดการออกกำลังกายหนักกลางแจ้ง", "จำกัดการออกกำลังกายกลางแจ้ง", 4),
    kids: T("Indoor play for now. Keep trips out short.", "Indoor play for now", "ช่วงนี้ให้เด็กเล่นในบ้าน ออกไปข้างนอกให้สั้นที่สุด", "เล่นในบ้านไปก่อน", 5),
    sensitive: T("Avoid hard exercise outside for now. Keep trips out short.", "Avoid outdoor exertion", "งดกิจกรรมที่ใช้แรงมากกลางแจ้งไปก่อน ออกไปข้างนอกให้สั้นที่สุด", "งดกิจกรรมหนักกลางแจ้ง", 5),
    exercising: T("Move your workout indoors.", "Work out indoors", "ย้ายไปออกกำลังกายในอาคาร", "ออกกำลังกายในอาคาร", 4),
    outdoor_worker: T("Take regular breaks indoors. Ask about lighter outdoor tasks.", "Take regular indoor breaks", "พักในอาคารเป็นระยะ สอบถามเรื่องงานกลางแจ้งที่เบาลง", "พักในอาคารเป็นระยะ", 4),
  },
  affects_health: {
    general: T("Avoid outdoor activities for now. Go out only if you need to.", "Stay indoors for now", "หลีกเลี่ยงกิจกรรมกลางแจ้งไปก่อน ออกไปข้างนอกเมื่อจำเป็นเท่านั้น", "อยู่ในอาคารไปก่อน", 6),
    kids: T("Keep kids indoors for now.", "Kids indoors for now", "ให้เด็กอยู่ในบ้านไปก่อน", "ให้เด็กอยู่ในบ้าน", 7),
    sensitive: T("Stay indoors for now. Keep your medicine close.", "Stay indoors for now", "อยู่ในที่ปลอดภัยไปก่อน เตรียมยาประจำตัวให้พร้อม", "อยู่ในอาคารไปก่อน", 7),
    exercising: T("Skip outdoor exercise and keep time outside short for now.", "No outdoor exercise", "งดออกกำลังกายกลางแจ้ง และลดเวลาอยู่กลางแจ้งไปก่อน", "งดออกกำลังกายกลางแจ้ง", 6),
    outdoor_worker: T("Limit time outside for now. Ask about indoor work.", "Limit time outside", "ลดเวลาอยู่กลางแจ้งไปก่อน สอบถามเรื่องงานในอาคาร", "ลดเวลากลางแจ้ง", 6),
  },
};

export const THAI_COPY = {
  bigNumberLabel: { en: "PM2.5 in the last hour", th: "PM2.5 ชั่วโมงล่าสุด" },
  unit: { en: "µg/m³", th: "มคก./ลบ.ม." },
  groups: { general: "ประชาชนทั่วไป", sensitive: "ประชาชนกลุ่มเสี่ยง" },
  officialLabel: {
    en: (v: number, cat: string) => `PCD Thai AQI (24-hr): ${v} · ${cat}`,
    th: (v: number, cat: string) => `ดัชนีคุณภาพอากาศ กรมควบคุมมลพิษ (24 ชม.): ${v} · ${cat}`,
  },
  explainer: {
    en: "The Thai AQI uses the 24-hour average of PM2.5, so it changes slowly. The big number is the last hour. Both come from PCD.",
    th: "AQI ของไทยใช้ค่าเฉลี่ย PM2.5 24 ชั่วโมง จึงเปลี่ยนช้า ตัวเลขใหญ่คือค่าชั่วโมงล่าสุด ทั้งสองค่ามาจากกรมควบคุมมลพิษ",
  },
  provenance: {
    en: (station: string, km: string, time: string) => `PCD ${station} station · ${km} km · measured ${time} (Thailand time)`,
    th: (station: string, km: string, time: string) => `สถานี ${station} (คพ.) · ${km} กม. · วัดเมื่อ ${time}`,
  },
  footer: { en: "Data: Pollution Control Department (PCD) Air4Thai", th: "ข้อมูล: กรมควบคุมมลพิษ (Air4Thai)" },
} as const;

export interface ThaiSecondLine {
  en: string;
  th: string;
}

/** 1-hr at least 1.5× (and 15 above) the 24-h average: the Thai "now" signal (no unofficial 1-hr band). */
export function hourAboveDay(pm25: number | null, pm25_24h: number | null): boolean {
  return pm25 !== null && pm25_24h !== null && pm25 >= Math.max(1.5 * pm25_24h, pm25_24h + 15);
}

export function thaiSecondLine(
  s: Pick<CountrySnapshot, "stale" | "observedAt" | "trend" | "level" | "pm25" | "pm25_24h">,
): ThaiSecondLine | null {
  if (s.stale)
    return {
      en: `Reading is from ${formatLocalTime(s.observedAt)}. It may not match the air now.`,
      th: `ค่าที่แสดงเป็นของเวลา ${formatThaiTime(s.observedAt)} อาจไม่ตรงกับอากาศตอนนี้`,
    };
  const lvl = s.level ?? 0;
  if (s.trend.delta >= 20)
    return lvl >= 1
      ? { en: "Getting worse. Check again in an hour.", th: "ค่าฝุ่นกำลังสูงขึ้น ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง" }
      : { en: "Rising quickly. Check again in an hour.", th: "ค่าฝุ่นเพิ่มขึ้นเร็ว ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง" };
  if (hourAboveDay(s.pm25, s.pm25_24h))
    return {
      en: "The last hour is higher than the 24-hour average. Check again in an hour.",
      th: "ค่าชั่วโมงล่าสุดสูงกว่าค่าเฉลี่ย 24 ชั่วโมง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง",
    };
  if (s.trend.delta <= -20 && lvl >= 1)
    return { en: "Getting better. Check again in an hour.", th: "ค่าฝุ่นกำลังลดลง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง" };
  return null;
}

const TH_TIE: ThGroup[] = ["sensitive", "kids", "exercising", "outdoor_worker", "general"];
function thGroup(p: Profile): ThGroup {
  if (p === "elderly" || p === "pregnant" || p === "heart_lung") return "sensitive";
  return p as ThGroup;
}

export interface CountryVerdict extends Verdict {
  /** True when the headline is hedged on a 24-hr index (no official 1-hr number here). */
  hedged?: boolean;
  /** Copy is a draft awaiting native review (TH table, MY/ID/VN/PH category rows). */
  needsReview?: boolean;
  /** The headline comes from a community estimate mapped to the authority's category ("Estimate: …"). */
  estimate?: boolean;
  /** No national scale: the headline follows WHO 2021 guidance bands (WHO_VERDICT_BANDS). */
  whoBased?: boolean;
  /** Local-language headline (TH), or null. */
  headlineLocal: string | null;
  shortLocal: string | null;
  secondLineLocal: string | null;
}

export function thaiVerdict(s: CountrySnapshot, profile: readonly Profile[] = ["general"]): CountryVerdict | null {
  const key = s.localBand?.scaleId === "th_aqi" ? s.localBand.key : null;
  if (!key) return null;
  const row = THAI_VERDICTS[key];
  const ids = normaliseProfile(profile);
  let pick: ThGroup = thGroup(ids[0]);
  let pickProfile: Profile = ids[0];
  for (const p of ids) {
    const g = thGroup(p);
    if (row[g].strict > row[pick].strict || (row[g].strict === row[pick].strict && TH_TIE.indexOf(g) < TH_TIE.indexOf(pick))) {
      pick = g;
      pickProfile = p;
    }
  }
  const cell = row[pick];
  const second = thaiSecondLine(s);
  return {
    headline: cell.en,
    short: cell.short,
    secondLine: second?.en ?? null,
    forWhom: forWhom(ids),
    profile: pickProfile,
    sensitive: isSensitive(ids),
    headlineLocal: cell.th,
    shortLocal: cell.shortTh,
    secondLineLocal: second?.th ?? null,
  };
}

/* ------------------------------------------------------------------ category verdicts (MY, ID, VN, PH) */

/**
 * Advice severity, one scale for every authority (0–4):
 * 0 no restriction · 1 take it easier (sensitive, or brief caution) · 2 reduce long/hard activity outside ·
 * 3 avoid hard activity outside / sensitive avoid going out · 4 stay indoors.
 */
export type Severity = 0 | 1 | 2 | 3 | 4;
export type AdviceGroup = ThGroup;

/** What each authority asks of the general public and of sensitive groups, per category (docs/sea/<country>.md). */
export const CATEGORY_SEVERITY: Record<string, Record<string, { general: Severity; sensitive: Severity }>> = {
  // PCD (thailand.md): 1–2 none; 3 general reduce strenuous; 4 at-risk avoid strenuous, everyone limit; 5 everyone avoid.
  th_aqi: {
    very_good: { general: 0, sensitive: 0 },
    good: { general: 0, sensitive: 0 },
    moderate: { general: 2, sensitive: 2 },
    starting_to_affect: { general: 2, sensitive: 3 },
    affects_health: { general: 4, sensitive: 4 },
  },
  // DOE Malaysia API (malaysia.md): Tidak Sihat limits the high-risk; Sangat Tidak Sihat keeps old/high-risk indoors.
  my_api: {
    good: { general: 0, sensitive: 0 },
    moderate: { general: 0, sensitive: 0 },
    unhealthy: { general: 1, sensitive: 2 },
    very_unhealthy: { general: 2, sensitive: 4 },
    hazardous: { general: 4, sensitive: 4 },
    emergency: { general: 4, sensitive: 4 },
  },
  // KLH ISPU (indonesia.md): Sedang sensitive reduce; Tidak Sehat everyone reduce, sensitive avoid; SST everyone avoid
  // prolonged activity, sensitive avoid all outdoor; Berbahaya everyone avoid all outdoor.
  id_ispu: {
    baik: { general: 0, sensitive: 0 },
    sedang: { general: 0, sensitive: 1 },
    tidak_sehat: { general: 2, sensitive: 3 },
    sangat_tidak_sehat: { general: 3, sensitive: 4 },
    berbahaya: { general: 4, sensitive: 4 },
  },
  // VN_AQI (vietnam.md; Table 3 advice not yet obtained, so mapped like the US-style bands it mirrors).
  vn_aqi: {
    tot: { general: 0, sensitive: 0 },
    trung_binh: { general: 0, sensitive: 1 },
    kem: { general: 1, sensitive: 2 },
    xau: { general: 2, sensitive: 3 },
    rat_xau: { general: 3, sensitive: 4 },
    nguy_hai: { general: 4, sensitive: 4 },
  },
  // DENR DAO 2020-14 (philippines.md).
  ph_dao_2020_14: {
    good: { general: 0, sensitive: 0 },
    fair: { general: 0, sensitive: 1 },
    usg: { general: 1, sensitive: 2 },
    very_unhealthy: { general: 3, sensitive: 4 },
    acutely_unhealthy: { general: 3, sensitive: 4 },
    emergency: { general: 4, sensitive: 4 },
  },
};

/**
 * First category that is the equivalent of "Unhealthy" (Tidak Sehat / above Sederhana …). From here on a headline never
 * says "Fine" or "OK to be out".
 */
export const UNHEALTHY_FROM: Record<string, string> = {
  th_aqi: "starting_to_affect",
  my_api: "unhealthy",
  id_ispu: "tidak_sehat",
  vn_aqi: "kem",
  ph_dao_2020_14: "usg",
};

type Cell = { en: string; short: string; sev: Severity };
type Row = Record<AdviceGroup, Cell>;
const c = (en: string, short: string, sev: Severity): Cell => ({ en, short, sev });

/** Rows in COPY.md's tone. DRAFT: English only; needs review by native speakers and each authority's wording. */
const ROW = {
  fine: {
    general: c("Fine to be out.", "Fine to be out", 0),
    kids: c("Fine for outdoor play.", "Fine for outdoor play", 0),
    sensitive: c("Fine to be out.", "Fine to be out", 0),
    exercising: c("Fine to exercise outside.", "Fine to exercise outside", 0),
    outdoor_worker: c("Fine to work outside.", "Fine to work outside", 0),
  },
  sensitiveEasy: {
    general: c("Fine to be out.", "Fine to be out", 0),
    kids: c("Fine for outdoor play. Keep long, hard games short.", "Fine, keep hard games short", 1),
    sensitive: c("Fine to be out. Keep hard exercise short.", "Keep hard exercise short", 1),
    exercising: c("Fine to exercise outside.", "Fine to exercise outside", 0),
    outdoor_worker: c("Fine to work outside.", "Fine to work outside", 0),
  },
  goEasy: {
    general: c("Go easy outdoors for now. Keep hard exercise short.", "Go easy outdoors", 1),
    kids: c("Calm play outside for now. Skip running games.", "Calm play only", 2),
    sensitive: c("Limit time outside for now. Skip hard exercise.", "Limit time outside", 2),
    exercising: c("Keep your workout short and light, or move it indoors.", "Short, light workout", 2),
    outdoor_worker: c("Take breaks indoors when you can.", "Take indoor breaks", 1),
  },
  reduce: {
    general: c("Cut back on long or hard activity outside for now.", "Cut back outdoors", 2),
    kids: c("Indoor play for now. Keep trips out short.", "Indoor play for now", 3),
    sensitive: c("Avoid outdoor activity for now. Keep your medicine close.", "Avoid going out for now", 3),
    exercising: c("Move your workout indoors for now.", "Work out indoors", 3),
    outdoor_worker: c("Take regular breaks indoors. Ask about lighter tasks.", "Take regular indoor breaks", 2),
  },
  avoid: {
    general: c("Avoid long or hard activity outside. Keep trips out short.", "Keep trips out short", 3),
    kids: c("Keep kids indoors for now.", "Kids indoors for now", 4),
    sensitive: c("Stay indoors for now. Keep your medicine close.", "Stay indoors for now", 4),
    exercising: c("Skip outdoor exercise for now.", "No outdoor exercise", 3),
    outdoor_worker: c("Limit time outside. Ask about indoor work.", "Limit time outside", 3),
  },
  indoors: {
    general: c("Stay indoors for now. Go out only if you need to.", "Stay indoors for now", 4),
    kids: c("Keep kids indoors for now.", "Kids indoors for now", 4),
    sensitive: c("Stay indoors for now. Keep your medicine close.", "Stay indoors for now", 4),
    exercising: c("Skip outdoor exercise. Stay indoors for now.", "Stay indoors for now", 4),
    outdoor_worker: c("Keep time outside to a minimum. Ask about indoor work.", "Minimise time outside", 4),
  },
  emergency: {
    general: c("Stay indoors and follow official instructions.", "Stay indoors", 4),
    kids: c("Keep kids indoors and follow official instructions.", "Kids indoors", 4),
    sensitive: c("Stay indoors, keep your medicine close, and follow official instructions.", "Stay indoors", 4),
    exercising: c("Stay indoors and follow official instructions.", "Stay indoors", 4),
    outdoor_worker: c("Stop outdoor work if you can. Follow official instructions.", "Stop outdoor work", 4),
  },
} satisfies Record<string, Row>;

/** Verdict rows per scale and category (TH has its own bilingual table, THAI_VERDICTS). */
export const CATEGORY_VERDICTS: Record<string, Record<string, Row>> = {
  my_api: { good: ROW.fine, moderate: ROW.fine, unhealthy: ROW.goEasy, very_unhealthy: ROW.avoid, hazardous: ROW.indoors, emergency: ROW.emergency },
  id_ispu: { baik: ROW.fine, sedang: ROW.sensitiveEasy, tidak_sehat: ROW.reduce, sangat_tidak_sehat: ROW.avoid, berbahaya: ROW.indoors },
  vn_aqi: { tot: ROW.fine, trung_binh: ROW.sensitiveEasy, kem: ROW.goEasy, xau: ROW.reduce, rat_xau: ROW.avoid, nguy_hai: ROW.indoors },
  ph_dao_2020_14: { good: ROW.fine, fair: ROW.sensitiveEasy, usg: ROW.goEasy, very_unhealthy: ROW.avoid, acutely_unhealthy: ROW.avoid, emergency: ROW.indoors },
};

/** Severity of each Thai verdict cell (same 0–4 scale), for the parity test. */
export const THAI_CELL_SEVERITY: Record<string, Record<AdviceGroup, Severity>> = {
  very_good: { general: 0, kids: 0, sensitive: 0, exercising: 0, outdoor_worker: 0 },
  good: { general: 0, kids: 0, sensitive: 0, exercising: 0, outdoor_worker: 0 },
  moderate: { general: 2, kids: 2, sensitive: 2, exercising: 2, outdoor_worker: 2 },
  starting_to_affect: { general: 2, kids: 3, sensitive: 3, exercising: 3, outdoor_worker: 2 },
  affects_health: { general: 4, kids: 4, sensitive: 4, exercising: 4, outdoor_worker: 4 },
};

/** Which category severity (general / sensitive) a group's verdict must meet. */
export const GROUP_BASIS: Record<AdviceGroup, "general" | "sensitive"> = {
  general: "general",
  kids: "sensitive",
  sensitive: "sensitive",
  exercising: "general",
  outdoor_worker: "general",
};

/** Shared band for actions/notifications from a category's advice (0 normal · 1–2 elevated · 3 high · 4 very_high). */
export function severityBand(sev: Severity): "normal" | "elevated" | "high" | "very_high" {
  return sev === 0 ? "normal" : sev <= 2 ? "elevated" : sev === 3 ? "high" : "very_high";
}

/** The chip's advice severity for the general public (null when there is no chip). */
export function chipSeverity(s: Pick<CountrySnapshot, "localBand">): { general: Severity; sensitive: Severity } | null {
  const b = s.localBand;
  return b ? CATEGORY_SEVERITY[b.scaleId]?.[b.key] ?? null : null;
}

const BAND_RANK = { normal: 0, elevated: 1, high: 2, very_high: 3 } as const;
type SharedBand = keyof typeof BAND_RANK;

/** True when the chip's category is at or above the scale's "Unhealthy" equivalent (UNHEALTHY_FROM). */
export function atOrAboveUnhealthy(scaleId: string, key: string): boolean {
  const from = UNHEALTHY_FROM[scaleId];
  const bands = SCALES[scaleId]?.bands;
  if (!from || !bands) return false;
  const i = bands.findIndex((b) => b.key === key);
  const f = bands.findIndex((b) => b.key === from);
  return i >= 0 && f >= 0 && i >= f;
}

/**
 * Band that drives "What helps now" (COPY §5 actions) and notifications outside SG: the closest SG band **by the
 * authority's advice severity** for the chip's category, never by SG's concentration bands. From the "Unhealthy"
 * equivalent up it is at least High (close windows, purifier, reschedule exercise; masks never first, no N95 for kids).
 * SG keeps its own `band`.
 */
export function adviceBand(s: Pick<CountrySnapshot, "country" | "band" | "localBand">): SharedBand | null {
  if (s.country === "SG") return s.band;
  const b = s.localBand;
  const sev = chipSeverity(s);
  if (!b || !sev) return s.band;
  let band: SharedBand = severityBand(Math.max(sev.general, sev.sensitive >= 3 ? 2 : 0) as Severity);
  if (atOrAboveUnhealthy(b.scaleId, b.key) && BAND_RANK[band] < BAND_RANK.high) band = "high";
  return band;
}

/** Emergency medical numbers (for the "Feeling unwell?" action; SG's is 995). */
export const EMERGENCY_NUMBER: Record<CountryCode, string> = {
  SG: "995", TH: "1669", MY: "999", ID: "112", VN: "115", PH: "911", LA: "1195", KH: "119", MM: "192", BN: "991", TL: "112",
};

/** "What helps now" outside SG: COPY §5 actions for adviceBand(), with the local emergency number. */
export function countryActions(s: Pick<CountrySnapshot, "country" | "band" | "localBand">, profile: readonly Profile[] = ["general"], max = 3): string[] {
  const band = adviceBand(s);
  if (!band) return [];
  const list = actions(band, profile, max);
  return s.country === "SG" ? list : list.map((a) => a.replace(/call 995\b/, `call ${EMERGENCY_NUMBER[s.country]}`));
}

export function categoryVerdictCell(scaleId: string, key: string, profile: readonly Profile[]): { cell: Cell; group: AdviceGroup; profile: Profile } | null {
  const row = CATEGORY_VERDICTS[scaleId]?.[key];
  if (!row) return null;
  const ids = normaliseProfile(profile);
  let pick: AdviceGroup = thGroup(ids[0]);
  let pickProfile: Profile = ids[0];
  for (const p of ids) {
    const g = thGroup(p);
    if (row[g].sev > row[pick].sev || (row[g].sev === row[pick].sev && TH_TIE.indexOf(g) < TH_TIE.indexOf(pick))) {
      pick = g;
      pickProfile = p;
    }
  }
  return { cell: row[pick], group: pick, profile: pickProfile };
}

/** "Based on the 24-hr index: …" when the only official figure is a slow 24-hr index (no official 1-hr number). */
export function hedgedOn24h(s: Pick<CountrySnapshot, "bandBasis" | "official" | "pm25Kind">): boolean {
  return s.bandBasis === "official_index" && s.official?.averaging === "24h" && s.pm25Kind !== "official_1h";
}
export const HEDGE_24H = "Based on the 24-hr index: ";
const hedge = (h: string) => HEDGE_24H + h.charAt(0).toLowerCase() + h.slice(1);

/* ------------------------------------------------------------------ all countries */

/** The country has a scale, but nothing official is near enough to band this place (e.g. HCMC today). */
export const NO_OFFICIAL_COPY = {
  headline: "No official reading near here.",
  short: "No official reading",
} as const;

export const NO_SCALE_COPY = {
  headline: "There's no official air-quality scale here.",
  short: "No official scale",
  whoLine: (x: number) => `${x}× the WHO daily guideline.`,
  crowdProvenance: (n: number) => `Estimate from ${n} community sensor${n === 1 ? "" : "s"} · not a government reading`,
} as const;

/**
 * No national scale (KH, LA, MM, TL): a verdict from WHO 2021 guidance on the hourly estimate, labelled as such
 * (COPY.md §20, founder-approved defaults). Four calm bands; `sev` follows the same 0–4 severity as the categories.
 */
export const WHO_VERDICT_BANDS = [
  { max: 25, key: "low", word: "low", en: "Likely fine to be out.", short: "Likely fine", sev: 0 as Severity, level: 0 as const },
  { max: 50, key: "moderate", word: "moderate", en: "Likely OK. Sensitive people, go easy.", short: "Likely OK", sev: 1 as Severity, level: 1 as const },
  { max: 100, key: "high", word: "high", en: "Go easy outdoors for now.", short: "Go easy outdoors", sev: 2 as Severity, level: 2 as const },
  { max: Infinity, key: "very_high", word: "very high", en: "Limit time outside for now.", short: "Limit time outside", sev: 3 as Severity, level: 3 as const },
] as const;

/** WHO band for an hourly PM2.5 estimate: under 25, 25–50, 50–100, 100 and up. */
export function whoVerdictBand(pm25: number) {
  return WHO_VERDICT_BANDS.find((b) => pm25 < b.max)!;
}

/** Honest prefix for a verdict that comes from a community estimate (the chip carries an "estimate" tag too). */
export const ESTIMATE_PREFIX = { en: "Estimate: ", short: "Est. ", th: "ค่าประมาณ: " } as const;
const lcFirst = (x: string) => (/^[A-Z][a-z]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x);

/** A verdict can't answer "is it OK to be out?" when there's no number at all: this says so, calmly. */
export const NO_READING_VERDICT = { headline: "Can't say for here right now.", short: "No reading nearby" } as const;

/** Headline for any CountrySnapshot and profile (see the module comment for the per-country rules). */
export function countryVerdict(s: CountrySnapshot, profile: readonly Profile[] = ["general"]): CountryVerdict {
  const v = baseVerdict(s, profile);
  if (!s.bandFromEstimate) return v;
  return {
    ...v,
    headline: ESTIMATE_PREFIX.en + lcFirst(v.headline),
    short: ESTIMATE_PREFIX.short + lcFirst(v.short),
    headlineLocal: v.headlineLocal ? ESTIMATE_PREFIX.th + v.headlineLocal : v.headlineLocal,
    estimate: true,
  };
}

function baseVerdict(s: CountrySnapshot, profile: readonly Profile[]): CountryVerdict {
  const ids = normaliseProfile(profile);
  const hedged = hedgedOn24h(s);
  if (s.country === "TH") {
    const v = thaiVerdict(s, ids);
    if (v) return hedged ? { ...v, headline: hedge(v.headline), hedged, needsReview: true } : { ...v, needsReview: true };
  }
  const cat = s.localBand ? categoryVerdictCell(s.localBand.scaleId, s.localBand.key, ids) : null;
  if (cat && s.country !== "SG") {
    let secondLine: string | null = null;
    if (s.stale) secondLine = `Reading is from ${formatLocalTime(s.observedAt)}. It may not match the air now.`;
    else if (s.trend.delta >= 20 && s.pm25 !== null) secondLine = "Rising quickly. Check again in an hour.";
    else if (s.bandBasis === "official_index" && hourAboveDay(s.pm25, s.pm25_24h))
      secondLine =
        s.pm25Kind === "crowd_estimate"
          ? "Nearby sensors read higher than the 24-hour average. Check again in an hour."
          : "The last hour is higher than the 24-hour average. Check again in an hour.";
    else if (s.trend.delta <= -20 && s.pm25 !== null && cat.cell.sev >= 1) secondLine = "Getting better. Check again in an hour.";
    return {
      headline: hedged ? hedge(cat.cell.en) : cat.cell.en,
      short: cat.cell.short,
      secondLine,
      forWhom: forWhom(ids),
      profile: cat.profile,
      sensitive: isSensitive(ids),
      hedged,
      needsReview: true,
      headlineLocal: null,
      shortLocal: null,
      secondLineLocal: null,
    };
  }
  if (s.band) {
    const opts = { stale: s.stale, observedAt: s.observedAt, history: s.history };
    const v = sgVerdict(s.band, ids, s.trend as Trend, opts);
    let secondLine = v.secondLine;
    if (s.country !== "SG" && s.stale) secondLine = `Reading is from ${formatLocalTime(s.observedAt)}. It may not match the air now.`;
    else if (s.country !== "SG" && !secondLine && s.bandBasis === "official_index" && hourAboveDay(s.pm25, s.pm25_24h))
      secondLine =
        s.pm25Kind === "crowd_estimate"
          ? "Nearby sensors read higher than the 24-hour average. Check again in an hour."
          : "The last hour is higher than the 24-hour average. Check again in an hour.";
    return { ...v, secondLine, headlineLocal: null, shortLocal: null, secondLineLocal: null };
  }
  const hasScale = CHIP_SCALE[s.country] !== null;
  if (!hasScale && s.pm25 !== null) {
    const w = whoVerdictBand(s.pm25);
    return {
      headline: w.en,
      short: w.short,
      secondLine: s.stale ? `Reading is from ${formatLocalTime(s.observedAt)}. It may not match the air now.` : NO_SCALE_COPY.whoLine(s.whoMultiple!),
      forWhom: forWhom(ids),
      profile: ids[0],
      sensitive: isSensitive(ids),
      whoBased: true,
      headlineLocal: null,
      shortLocal: null,
      secondLineLocal: null,
    };
  }
  // No number and nothing official to band (NO_OFFICIAL_COPY / NO_SCALE_COPY go under the number, never here).
  return {
    headline: NO_READING_VERDICT.headline,
    short: NO_READING_VERDICT.short,
    secondLine: s.whoMultiple !== null ? NO_SCALE_COPY.whoLine(s.whoMultiple) : null,
    forWhom: forWhom(ids),
    profile: ids[0],
    sensitive: isSensitive(ids),
    headlineLocal: null,
    shortLocal: null,
    secondLineLocal: null,
  };
}

/** "PCD Thai AQI (24-hr): 42 · Satisfactory" style official row, in the authority's words. No "lagging". */
export function officialLine(s: Pick<CountrySnapshot, "official" | "localBand" | "bandBasis">): string | null {
  const o = s.official;
  if (!o) return null;
  const avg = o.averaging === "24h" ? "24-hr" : o.averaging === "nowcast" ? "hourly" : "1-hr";
  const word = s.bandBasis === "official_index" && s.localBand ? `${s.localBand.labelLocal} (${s.localBand.labelEn})` : o.category ?? "";
  return `${o.agency} ${o.name} (${avg}): ${o.value}${word ? ` · ${word}` : ""}`;
}
