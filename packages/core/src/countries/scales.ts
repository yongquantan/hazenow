/**
 * Band-scale registry (REGIONAL §3.3, option E: "one unit, local words").
 *
 * - The big number is always PM2.5 in µg/m³.
 * - The chip uses the **local authority's own category** for the number it describes, from the jurisdiction
 *   where the reading was measured. Words are verbatim (local language + the authority's English).
 * - `level` (0–3) is mapped per category by the **advice the authority attaches**, not by concentration.
 *   It only selects COPY.md's shared verdict/action/notification logic.
 * - We never compute a local index number. `pm25` ranges classify a concentration; `index` ranges classify a
 *   number the authority itself published.
 *
 * Breakpoints and words come from docs/sea/<country>.md (verified live 2026-09-28 unless flagged).
 */
import { roundHalfUp } from "../math.js";
import type { Band } from "../types.js";
import type { CountryCode, Level, LocalBand } from "./types.js";

export interface ScaleBand {
  key: string;
  labelEn: string;
  labelLocal: string;
  color: string;
  shape: LocalBand["shape"];
  /** null = this category carries no HazeNow level (official-row-only scales). */
  level: Level | null;
  /** Inclusive concentration range, µg/m³ (averaging = scale.pm25Averaging). */
  pm25?: readonly [number, number];
  /** Inclusive index range. */
  index?: readonly [number, number];
  /** Authority's advice, verbatim or condensed from the country doc (general / sensitive). */
  advice?: { general: string; sensitive?: string };
}

export interface BandScale {
  id: string;
  country: CountryCode | "WHO";
  agency: string;
  /** Name of the index, if any ("Thai AQI"). */
  indexName: string | null;
  lang: string;
  /** "chip": may drive the band chip + level. "official_only": used only to name an official index category. */
  role: "chip" | "official_only" | "reference";
  /** What the chip classifies by default. */
  basis: "pm25_1h" | "official_index";
  /** Averaging period of the concentration breakpoints as the authority defines them. */
  pm25Averaging: "1h" | "24h" | "nowcast" | null;
  /** Decimal places the authority publishes concentrations with (classification rounds to this). */
  precision: number;
  bands: readonly ScaleBand[];
  sourceUrl: string;
  verifiedAt: string;
  notes?: string;
}

const inf = Infinity;

export const SCALES: Record<string, BandScale> = {
  sg_nea_1h: {
    id: "sg_nea_1h",
    country: "SG",
    agency: "NEA",
    indexName: null,
    lang: "en",
    role: "chip",
    basis: "pm25_1h",
    pm25Averaging: "1h",
    precision: 0,
    sourceUrl: "https://www.haze.gov.sg/",
    verifiedAt: "2026-09-28",
    bands: [
      { key: "normal", labelEn: "Normal", labelLocal: "Normal", color: "#2E9E5B", shape: "circle", level: 0, pm25: [0, 55] },
      { key: "elevated", labelEn: "Elevated", labelLocal: "Elevated", color: "#E8A317", shape: "half", level: 1, pm25: [56, 150] },
      { key: "high", labelEn: "High", labelLocal: "High", color: "#E4572E", shape: "triangle", level: 2, pm25: [151, 250] },
      { key: "very_high", labelEn: "Very High", labelLocal: "Very High", color: "#7B2D8E", shape: "octagon", level: 3, pm25: [251, inf] },
    ],
  },
  sg_psi: {
    id: "sg_psi",
    country: "SG",
    agency: "NEA",
    indexName: "24-hr PSI",
    lang: "en",
    role: "official_only",
    basis: "official_index",
    pm25Averaging: "24h",
    precision: 0,
    sourceUrl: "https://www.haze.gov.sg/",
    verifiedAt: "2026-09-28",
    bands: [
      { key: "good", labelEn: "Good", labelLocal: "Good", color: "#2E9E5B", shape: "circle", level: null, index: [0, 50] },
      { key: "moderate", labelEn: "Moderate", labelLocal: "Moderate", color: "#2E6FB7", shape: "circle", level: null, index: [51, 100] },
      { key: "unhealthy", labelEn: "Unhealthy", labelLocal: "Unhealthy", color: "#E8A317", shape: "half", level: null, index: [101, 200] },
      { key: "very_unhealthy", labelEn: "Very Unhealthy", labelLocal: "Very Unhealthy", color: "#E4572E", shape: "triangle", level: null, index: [201, 300] },
      { key: "hazardous", labelEn: "Hazardous", labelLocal: "Hazardous", color: "#7B2D8E", shape: "octagon", level: null, index: [301, inf] },
    ],
  },
  th_aqi: {
    id: "th_aqi",
    country: "TH",
    agency: "PCD",
    indexName: "Thai AQI",
    lang: "th",
    role: "chip",
    // thailand.md §Index: the chip and the verdict follow the official (24-hr) Thai AQI; the 1-hr number is NOT banded.
    basis: "official_index",
    pm25Averaging: "24h",
    precision: 1,
    sourceUrl: "https://air4thai.pcd.go.th/webV3/",
    verifiedAt: "2026-09-28",
    notes:
      "Levels follow PCD advice: bands 1–2 no restriction; 3 general reduce time on strenuous activity; 4 at-risk avoid strenuous, everyone limit; 5 everyone avoid outdoor activities.",
    bands: [
      { key: "very_good", labelEn: "Excellent", labelLocal: "ดีมาก", color: "#00BFF3", shape: "circle", level: 0, pm25: [0, 15.0], index: [0, 25],
        advice: { general: "Everyone can live their life normally." } },
      { key: "good", labelEn: "Satisfactory", labelLocal: "ดี", color: "#00A651", shape: "circle", level: 0, pm25: [15.1, 25.0], index: [26, 50],
        advice: { general: "Able to do outdoor activities normally.", sensitive: "Watch for abnormal symptoms such as frequent coughing or difficulty breathing." } },
      { key: "moderate", labelEn: "Moderate", labelLocal: "ปานกลาง", color: "#FDC04E", shape: "half", level: 1, pm25: [25.1, 37.5], index: [51, 100],
        advice: { general: "Reduce the time spent on strenuous outdoor activities or exercise.", sensitive: "Reduce strenuous activity; see a doctor if symptoms appear." } },
      { key: "starting_to_affect", labelEn: "Starting to affect health", labelLocal: "เริ่มมีผลกระทบต่อสุขภาพ", color: "#F26522", shape: "triangle", level: 2, pm25: [37.6, 75.0], index: [101, 200],
        advice: { general: "Limit the time spent on strenuous outdoor activities.", sensitive: "Avoid outdoor activities or exercise that need a lot of energy." } },
      { key: "affects_health", labelEn: "Affects health", labelLocal: "มีผลกระทบต่อสุขภาพ", color: "#CD0000", shape: "octagon", level: 3, pm25: [75.1, inf], index: [201, inf],
        advice: { general: "Avoid outdoor activities.", sensitive: "Stay in a safe area and keep medicines ready." } },
    ],
  },
  my_api: {
    id: "my_api",
    country: "MY",
    agency: "DOE Malaysia",
    indexName: "API",
    lang: "ms",
    role: "chip",
    // malaysia.md: no official 1-hr PM2.5 and no 1-hr bands; the chip follows the DOE API (24-hr based).
    basis: "official_index",
    pm25Averaging: "24h",
    precision: 1,
    sourceUrl: "https://eqms.doe.gov.my/Documents/APIMS/API_Calculation.pdf",
    verifiedAt: "2026-09-28",
    bands: [
      { key: "good", labelEn: "Good", labelLocal: "Baik", color: "#3D8AF7", shape: "circle", level: 0, index: [0, 50], pm25: [0, 12.0],
        advice: { general: "No restriction for outdoor activities to the public. Maintain healthy lifestyle." } },
      { key: "moderate", labelEn: "Moderate", labelLocal: "Sederhana", color: "#7CDE6B", shape: "circle", level: 0, index: [51, 100], pm25: [12.1, 50.4],
        advice: { general: "No restriction for outdoor activities to the public. Maintain healthy lifestyle." } },
      { key: "unhealthy", labelEn: "Unhealthy", labelLocal: "Tidak Sihat", color: "#FFFF00", shape: "half", level: 1, index: [101, 200], pm25: [50.5, 150.4],
        advice: { general: "Limited outdoor activities for the high risk people." } },
      { key: "very_unhealthy", labelEn: "Very Unhealthy", labelLocal: "Sangat Tidak Sihat", color: "#FFA500", shape: "triangle", level: 2, index: [201, 300], pm25: [150.5, 250.4],
        advice: { general: "Old and high risk people are advised to stay indoor and reduce physical activities." } },
      { key: "hazardous", labelEn: "Hazardous", labelLocal: "Merbahaya", color: "#FF0000", shape: "octagon", level: 3, index: [301, 500], pm25: [250.5, 500.4],
        advice: { general: "Public are advised to prevent from outdoor activities." } },
      { key: "emergency", labelEn: "Emergency", labelLocal: "Kecemasan", color: "#7E0023", shape: "octagon", level: 3, index: [501, inf], pm25: [500.5, inf],
        advice: { general: "Public are advised to follow orders from National Security Council." } },
    ],
  },
  id_ispu: {
    id: "id_ispu",
    country: "ID",
    agency: "KLH / BMKG",
    indexName: "ISPU",
    lang: "id",
    role: "chip",
    // indonesia.md: BMKG itself labels its 1-hr PM2.5 with the ISPU category names and breakpoints.
    basis: "pm25_1h",
    pm25Averaging: "24h",
    precision: 1,
    sourceUrl: "https://ispu.kemenlh.go.id/",
    verifiedAt: "2026-09-28",
    bands: [
      { key: "baik", labelEn: "Good", labelLocal: "Baik", color: "#00CC00", shape: "circle", level: 0, pm25: [0, 15.5], index: [0, 50],
        advice: { general: "Sangat baik melakukan kegiatan di luar." } },
      { key: "sedang", labelEn: "Moderate", labelLocal: "Sedang", color: "#0000CC", shape: "circle", level: 0, pm25: [15.6, 55.4], index: [51, 100],
        advice: { general: "Masih dapat beraktivitas di luar.", sensitive: "Kurangi aktivitas fisik yang terlalu lama atau berat." } },
      { key: "tidak_sehat", labelEn: "Unhealthy", labelLocal: "Tidak Sehat", color: "#CCCC00", shape: "half", level: 1, pm25: [55.5, 150.4], index: [101, 200],
        advice: { general: "Mengurangi aktivitas fisik yang terlalu lama di luar ruangan." } },
      { key: "sangat_tidak_sehat", labelEn: "Very Unhealthy", labelLocal: "Sangat Tidak Sehat", color: "#CC0000", shape: "triangle", level: 2, pm25: [150.5, 250.4], index: [201, 300],
        advice: { general: "Hindari aktivitas fisik yang terlalu lama di luar ruangan.", sensitive: "Hindari semua aktivitas di luar." } },
      { key: "berbahaya", labelEn: "Hazardous", labelLocal: "Berbahaya", color: "#000000", shape: "octagon", level: 3, pm25: [250.5, inf], index: [301, inf],
        advice: { general: "Hindari semua aktivitas di luar.", sensitive: "Tetap di dalam ruangan dan hanya melakukan sedikit aktivitas." } },
    ],
  },
  vn_aqi: {
    id: "vn_aqi",
    country: "VN",
    agency: "VEA / CEM",
    indexName: "VN_AQI",
    lang: "vi",
    role: "chip",
    // vietnam.md: the chip follows the official published hourly VN_AQI (NowCast-based); never an "instant VN_AQI".
    basis: "official_index",
    pm25Averaging: "nowcast",
    precision: 1,
    sourceUrl: "https://cem.gov.vn/",
    verifiedAt: "2026-09-28",
    notes: "PM2.5 breakpoints 0/25/50/80 verified (20/20 hours); 150/250/350/500 unverified (Table 2 of QĐ 1459 not reachable).",
    bands: [
      { key: "tot", labelEn: "Good", labelLocal: "Tốt", color: "#00E400", shape: "circle", level: 0, index: [0, 50], pm25: [0, 25] },
      { key: "trung_binh", labelEn: "Moderate", labelLocal: "Trung bình", color: "#FFFF00", shape: "circle", level: 0, index: [51, 100], pm25: [25.1, 50] },
      { key: "kem", labelEn: "Poor", labelLocal: "Kém", color: "#FF7E00", shape: "half", level: 1, index: [101, 150], pm25: [50.1, 80] },
      { key: "xau", labelEn: "Bad", labelLocal: "Xấu", color: "#FF0000", shape: "triangle", level: 2, index: [151, 200], pm25: [80.1, 150] },
      { key: "rat_xau", labelEn: "Very bad", labelLocal: "Rất xấu", color: "#8F3F97", shape: "octagon", level: 3, index: [201, 300], pm25: [150.1, 250] },
      { key: "nguy_hai", labelEn: "Hazardous", labelLocal: "Nguy hại", color: "#7E0023", shape: "octagon", level: 3, index: [301, inf], pm25: [250.1, inf] },
    ],
  },
  ph_dao_2020_14: {
    id: "ph_dao_2020_14",
    country: "PH",
    agency: "DENR-EMB",
    indexName: null,
    lang: "en",
    role: "chip",
    basis: "pm25_1h",
    pm25Averaging: null,
    precision: 1,
    sourceUrl: "https://law.upd.edu.ph/wp-content/uploads/2021/03/DENR-Administrative-Order-No-2020-14.pdf",
    verifiedAt: "2026-09-28",
    notes: "DAO 2020-14 does not state the averaging period in its AQI table (philippines.md). Applied to the crowd 1-hr mean, attributed as the DAO category.",
    bands: [
      { key: "good", labelEn: "Good", labelLocal: "Good", color: "#00E400", shape: "circle", level: 0, pm25: [0, 25] },
      { key: "fair", labelEn: "Fair", labelLocal: "Fair", color: "#FFFF00", shape: "circle", level: 0, pm25: [25.1, 35] },
      { key: "usg", labelEn: "Unhealthy for sensitive groups", labelLocal: "Unhealthy for sensitive groups", color: "#FF7E00", shape: "half", level: 1, pm25: [35.1, 45],
        advice: { general: "None.", sensitive: "People with respiratory disease, such as asthma, should limit outdoor exertion." } },
      { key: "very_unhealthy", labelEn: "Very Unhealthy", labelLocal: "Very Unhealthy", color: "#FF0000", shape: "triangle", level: 2, pm25: [45.1, 55],
        advice: { general: "Pedestrians should avoid heavy traffic areas. Unnecessary trips should be postponed.", sensitive: "People with heart or respiratory disease should stay indoors and rest as much as possible." } },
      { key: "acutely_unhealthy", labelEn: "Acutely unhealthy", labelLocal: "Acutely unhealthy", color: "#8F3F97", shape: "triangle", level: 2, pm25: [55.1, 90],
        advice: { general: "People should limit outdoor exertion.", sensitive: "People with heart or respiratory disease should stay indoors and rest as much as possible." } },
      { key: "emergency", labelEn: "Emergency", labelLocal: "Emergency", color: "#7E0023", shape: "octagon", level: 3, pm25: [90.1, inf],
        advice: { general: "Everyone should remain indoors." } },
    ],
  },
  bn_jastre_psi: {
    id: "bn_jastre_psi",
    country: "BN",
    agency: "JASTRe",
    indexName: "PSI",
    lang: "ms",
    role: "official_only",
    basis: "official_index",
    pm25Averaging: null,
    precision: 0,
    sourceUrl: "https://www.env.gov.bn/",
    verifiedAt: "2026-09-28",
    notes: "Image-only publication; no adapter. Averaging undisclosed.",
    bands: [
      { key: "baik", labelEn: "Good", labelLocal: "Tahap Baik", color: "#2E9E5B", shape: "circle", level: null, index: [0, 50] },
      { key: "sederhana", labelEn: "Moderate", labelLocal: "Tahap Sederhana", color: "#2E6FB7", shape: "circle", level: null, index: [51, 100] },
      { key: "tidak_sihat", labelEn: "Unhealthy", labelLocal: "Tahap Tidak Sihat", color: "#E8A317", shape: "half", level: null, index: [101, 200] },
      { key: "sangat_tidak_sihat", labelEn: "Very Unhealthy", labelLocal: "Tahap Sangat Tidak Sihat", color: "#E4572E", shape: "triangle", level: null, index: [201, 300] },
      { key: "merbahaya", labelEn: "Hazardous", labelLocal: "Tahap Merbahaya", color: "#7B2D8E", shape: "octagon", level: null, index: [301, inf] },
    ],
  },
  who_2021: {
    id: "who_2021",
    country: "WHO",
    agency: "WHO",
    indexName: null,
    lang: "en",
    role: "reference",
    basis: "pm25_1h",
    pm25Averaging: "24h",
    precision: 1,
    sourceUrl: "https://www.who.int/publications/i/item/9789240034228",
    verifiedAt: "2026-09-28",
    notes: "Neutral cross-border reference only (REGIONAL §3.3 rule 5). Never a chip.",
    bands: [
      { key: "aqg", labelEn: "AQG 15", labelLocal: "AQG 15", color: "#9AA5B1", shape: "circle", level: null, pm25: [0, 15] },
      { key: "it4", labelEn: "IT-4 25", labelLocal: "IT-4 25", color: "#9AA5B1", shape: "circle", level: null, pm25: [15.1, 25] },
      { key: "it3", labelEn: "IT-3 37.5", labelLocal: "IT-3 37.5", color: "#9AA5B1", shape: "circle", level: null, pm25: [25.1, 37.5] },
      { key: "it2", labelEn: "IT-2 50", labelLocal: "IT-2 50", color: "#9AA5B1", shape: "circle", level: null, pm25: [37.6, 50] },
      { key: "it1", labelEn: "IT-1 75", labelLocal: "IT-1 75", color: "#9AA5B1", shape: "circle", level: null, pm25: [50.1, inf] },
    ],
  },
};

/** Chip scale per jurisdiction. null = no national scale: show number + WHO line, no band (REGIONAL §3.3 rule 2). */
export const CHIP_SCALE: Record<CountryCode, string | null> = {
  SG: "sg_nea_1h",
  TH: "th_aqi",
  MY: "my_api",
  ID: "id_ispu",
  VN: "vn_aqi",
  PH: "ph_dao_2020_14",
  BN: "bn_jastre_psi",
  LA: null,
  KH: null,
  MM: null,
  TL: null,
};

export const WHO_24H_GUIDELINE = 15;

export function getScale(id: string): BandScale {
  const s = SCALES[id];
  if (!s) throw new Error(`Unknown band scale: ${id}`);
  return s;
}

function roundTo(x: number, dp: number): number {
  if (dp === 0) return roundHalfUp(x);
  const f = 10 ** dp;
  return roundHalfUp(x * f) / f;
}

/** Category of a concentration (µg/m³), rounded to the authority's precision first. Null if the scale has no pm25 ranges. */
export function classifyPm25(scaleId: string, pm25: number): ScaleBand | null {
  const s = getScale(scaleId);
  const withRanges = s.bands.filter((b) => b.pm25);
  if (withRanges.length === 0 || !Number.isFinite(pm25)) return null;
  const v = roundTo(Math.max(0, pm25), s.precision);
  return withRanges.find((b) => v <= b.pm25![1]) ?? withRanges[withRanges.length - 1];
}

/** Category of a published index value. Null if the scale has no index ranges. */
export function classifyIndex(scaleId: string, value: number): ScaleBand | null {
  const s = getScale(scaleId);
  const withRanges = s.bands.filter((b) => b.index);
  if (withRanges.length === 0 || !Number.isFinite(value)) return null;
  const v = roundHalfUp(Math.max(0, value));
  return withRanges.find((b) => v <= b.index![1]) ?? withRanges[withRanges.length - 1];
}

export function toLocalBand(scaleId: string, b: ScaleBand): LocalBand | null {
  if (b.level === null) return null;
  const s = getScale(scaleId);
  return {
    scaleId,
    key: b.key,
    labelEn: b.labelEn,
    labelLocal: b.labelLocal,
    lang: s.lang,
    color: b.color,
    shape: b.shape,
    level: b.level,
    agency: s.agency,
  };
}

/** Shared SPEC band for an advice level (drives COPY.md verdict/actions). */
export const LEVEL_BAND: Record<Level, Band> = { 0: "normal", 1: "elevated", 2: "high", 3: "very_high" };

export function levelBand(level: Level | null): Band | null {
  return level === null ? null : LEVEL_BAND[level];
}

/** pm25 / 15 (WHO 2021 24-h AQG), 1 dp. The only cross-border reference (REGIONAL §3.3 rule 5). */
export function whoMultiple(pm25: number | null): number | null {
  if (pm25 === null || !Number.isFinite(pm25)) return null;
  return Math.round((pm25 / WHO_24H_GUIDELINE) * 10) / 10;
}

/**
 * Malaysia: invert a PM2.5-driven DOE API to the 24-h PM2.5 average it came from (malaysia.md: exact,
 * DOE publishes the breakpoints). Only valid when PARAM_SELECTED is PM2.5.
 */
const MY_API_PM25: readonly (readonly [number, number, number, number])[] = [
  // [I_lo, I_hi, C_lo, C_hi]
  [0, 50, 0, 12.0],
  [51, 100, 12.1, 50.4],
  [101, 150, 50.5, 55.4],
  [151, 200, 55.5, 150.4],
  [201, 300, 150.5, 250.4],
  [301, 400, 250.5, 350.4],
  [401, 500, 350.5, 500.4],
];
export function myApiToPm25(api: number): number | null {
  if (!Number.isFinite(api) || api < 0) return null;
  for (const [ilo, ihi, clo, chi] of MY_API_PM25) {
    if (api <= ihi) {
      const c = clo + ((Math.max(api, ilo) - ilo) * (chi - clo)) / (ihi - ilo);
      return Math.round(c * 10) / 10;
    }
  }
  return null;
}
