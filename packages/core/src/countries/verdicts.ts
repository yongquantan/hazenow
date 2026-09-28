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
import { normaliseProfile, isSensitive, forWhom, verdict as sgVerdict, type Profile, type Verdict } from "../experience.js";
import type { Trend } from "../types.js";
import { CHIP_SCALE } from "./scales.js";
import type { CountrySnapshot } from "./types.js";

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
    exercising: T("Skip outdoor exercise for now.", "No outdoor exercise", "งดออกกำลังกายกลางแจ้งไปก่อน", "งดออกกำลังกายกลางแจ้ง", 6),
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

/** Headline for any CountrySnapshot and profile (see the module comment for the per-country rules). */
export function countryVerdict(s: CountrySnapshot, profile: readonly Profile[] = ["general"]): CountryVerdict {
  const ids = normaliseProfile(profile);
  if (s.country === "TH") {
    const v = thaiVerdict(s, ids);
    if (v) return v;
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
  return {
    headline: hasScale ? NO_OFFICIAL_COPY.headline : NO_SCALE_COPY.headline,
    short: hasScale ? NO_OFFICIAL_COPY.short : NO_SCALE_COPY.short,
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
