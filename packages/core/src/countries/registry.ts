/**
 * Per-country registry: status, sources, time zone, language, default place, chip scale.
 * Status follows docs/sea/COVERAGE.md (verified live 2026-09-28; coverage hunt 2026-09-30).
 */
import { CHIP_SCALE } from "./scales.js";
import type { CountryCode, CoverageStatus } from "./types.js";

export interface CountryInfo {
  code: CountryCode;
  name: string;
  /** Local UTC offset (hours). ID has three zones: WIB +7 is the default; station times carry their own offset. */
  utcOffset: number;
  languages: string[];
  status: CoverageStatus;
  /** Adapter ids, preferred first. */
  adapters: string[];
  chipScale: string | null;
  /** Used when no location is given. */
  defaultPlace: { name: string; lat: number; lon: number };
  /** What the big number is here, in one line (for "How we calculate this"). */
  nowNumber: string;
}

const C = (x: Omit<CountryInfo, "chipScale">): CountryInfo => ({ ...x, chipScale: CHIP_SCALE[x.code] });

export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  SG: C({ code: "SG", name: "Singapore", utcOffset: 8, languages: ["en", "zh", "ms", "ta"], status: "live_direct", adapters: ["sg.nea"],
    defaultPlace: { name: "Singapore", lat: 1.35735, lon: 103.82 }, nowNumber: "NEA 1-hr PM2.5 (5 regions)" }),
  TH: C({ code: "TH", name: "Thailand", utcOffset: 7, languages: ["th", "en"], status: "live_direct", adapters: ["th.air4thai"],
    defaultPlace: { name: "Bangkok", lat: 13.7563, lon: 100.5018 }, nowNumber: "PCD Air4Thai 1-hr PM2.5 (173 stations incl. 68 BMA); community sensors (via the proxy) only where no PCD station is within 25 km, e.g. Pai" }),
  MY: C({ code: "MY", name: "Malaysia", utcOffset: 8, languages: ["ms", "en"], status: "needs_proxy", adapters: ["my.proxy"],
    defaultPlace: { name: "Kuala Lumpur", lat: 3.139, lon: 101.6869 }, nowNumber: "No official 1-hr PM2.5; AirGradient estimate where sensors exist, DOE API (24-hr based) as the band" }),
  ID: C({ code: "ID", name: "Indonesia", utcOffset: 7, languages: ["id", "en"], status: "needs_proxy", adapters: ["id.proxy"],
    defaultPlace: { name: "Jakarta", lat: -6.2088, lon: 106.8456 }, nowNumber: "BMKG 1-hr PM2.5 (~25 stations); KLH ISPU (24-hr) as the official line" }),
  VN: C({ code: "VN", name: "Vietnam", utcOffset: 7, languages: ["vi", "en"], status: "needs_proxy", adapters: ["vn.proxy"],
    defaultPlace: { name: "Hanoi", lat: 21.0285, lon: 105.8542 }, nowNumber: "Hanoi only: 1-hr mean of 5-min PM2.5 (moitruongthudo.vn); VN_AQI hourly as the band" }),
  PH: C({ code: "PH", name: "Philippines", utcOffset: 8, languages: ["en", "fil"], status: "needs_proxy", adapters: ["ph.proxy"],
    defaultPlace: { name: "Metro Manila", lat: 14.5995, lon: 120.9842 }, nowNumber: "Community sensors only (AirGradient), DENR DAO 2020-14 categories" }),
  LA: C({ code: "LA", name: "Laos", utcOffset: 7, languages: ["lo", "th", "en"], status: "needs_proxy", adapters: ["la.proxy"],
    defaultPlace: { name: "Vientiane", lat: 17.9757, lon: 102.6331 }, nowNumber: "Community sensors only (AirGradient / UNICEF schools); no national scale" }),
  KH: C({ code: "KH", name: "Cambodia", utcOffset: 7, languages: ["km", "en"], status: "needs_proxy", adapters: ["kh.proxy"],
    defaultPlace: { name: "Siem Reap", lat: 13.3671, lon: 103.8448 }, nowNumber: "Community sensors only (AirGradient + Sensor.Community, Siem Reap); no government feed, no national scale" }),
  MM: C({ code: "MM", name: "Myanmar", utcOffset: 6.5, languages: ["my", "en"], status: "not_feasible", adapters: [],
    defaultPlace: { name: "Yangon", lat: 16.8409, lon: 96.1735 }, nowNumber: "None (1 suspect sensor, no government feed)" }),
  BN: C({ code: "BN", name: "Brunei", utcOffset: 8, languages: ["ms", "en"], status: "not_feasible", adapters: [],
    defaultPlace: { name: "Bandar Seri Begawan", lat: 4.9031, lon: 114.9398 }, nowNumber: "None (JASTRe PSI is an image only)" }),
  TL: C({ code: "TL", name: "Timor-Leste", utcOffset: 9, languages: ["pt", "tet", "en"], status: "not_feasible", adapters: [],
    defaultPlace: { name: "Dili", lat: -8.5569, lon: 125.5603 }, nowNumber: "None (no sensors)" }),
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];

export function isCountryCode(x: string): x is CountryCode {
  return x.toUpperCase() in COUNTRIES;
}
