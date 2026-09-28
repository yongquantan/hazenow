/**
 * City catalogue for the country picker (docs/sea/COVERAGE.md, verified 2026-09-28).
 * Each city carries its coverage status; blocked cities carry a plain-language reason for a calm
 * "Not available yet" state. Coordinates are city-centre points (the same ones COVERAGE.md measured from).
 */
import { COUNTRIES } from "./registry.js";
import type { CountryCode, CoverageStatus } from "./types.js";

export interface CityPlace {
  country: CountryCode;
  /** URL slug: ?country=th&area=bangkok */
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: CoverageStatus;
  /** Why it isn't available yet (needs_permission / not_feasible), in one or two calm sentences. */
  reason?: string;
}

const P = (country: CountryCode, name: string, lat: number, lon: number, status: CoverageStatus, reason?: string): CityPlace => ({
  country,
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  name,
  lat,
  lon,
  status,
  reason,
});

const PH_EMB =
  "The Philippines' air-quality site (DENR-EMB) blocks automated access, and there are no community sensors here yet. We've asked EMB for a data feed.";
const VN_CEM =
  "Vietnam's national monitoring site (CEM) is behind a CAPTCHA, so we can't read it yet. We're asking CEM for a data agreement.";

export const CITIES: readonly CityPlace[] = [
  P("SG", "Singapore", 1.35735, 103.82, "live_direct"),

  P("TH", "Bangkok", 13.7563, 100.5018, "live_direct"),
  P("TH", "Chiang Mai", 18.7883, 98.9853, "live_direct"),
  P("TH", "Chiang Rai", 19.9105, 99.8406, "live_direct"),
  P("TH", "Phuket", 7.8804, 98.3923, "live_direct"),
  P("TH", "Hat Yai", 7.0086, 100.4747, "live_direct"),
  P("TH", "Khon Kaen", 16.4322, 102.8236, "live_direct"),
  P("TH", "Pattaya", 12.9236, 100.8825, "live_direct"),
  P("TH", "Nakhon Ratchasima", 14.9799, 102.0978, "live_direct"),
  P("TH", "Udon Thani", 17.4138, 102.787, "live_direct"),

  P("MY", "Kuala Lumpur", 3.139, 101.6869, "needs_proxy"),
  P("MY", "Johor Bahru", 1.4927, 103.7414, "needs_proxy"),
  P("MY", "Penang", 5.4141, 100.3288, "needs_proxy"),
  P("MY", "Ipoh", 4.5975, 101.0901, "needs_proxy"),
  P("MY", "Malacca", 2.1896, 102.2501, "needs_proxy"),
  P("MY", "Kuching", 1.5535, 110.3593, "needs_proxy"),
  P("MY", "Kota Kinabalu", 5.9804, 116.0735, "needs_proxy"),

  P("ID", "Jakarta", -6.2088, 106.8456, "needs_proxy"),
  P("ID", "Surabaya", -7.2575, 112.7521, "needs_proxy"),
  P("ID", "Bandung", -6.9175, 107.6191, "needs_proxy"),
  P("ID", "Medan", 3.5952, 98.6722, "needs_proxy"),
  P("ID", "Palembang", -2.9761, 104.7754, "needs_proxy"),
  P("ID", "Jambi", -1.6101, 103.6131, "needs_proxy"),
  P("ID", "Pekanbaru", 0.5071, 101.4478, "needs_proxy"),
  P("ID", "Pontianak", -0.0263, 109.3425, "needs_proxy"),
  P("ID", "Palangka Raya", -2.2161, 113.9135, "needs_proxy"),
  P("ID", "Balikpapan", -1.2379, 116.8529, "needs_proxy"),
  P("ID", "Samarinda", -0.5022, 117.1536, "needs_proxy"),
  P("ID", "Makassar", -5.1477, 119.4327, "needs_proxy"),
  P("ID", "Denpasar", -8.6705, 115.2126, "needs_proxy"),
  P("ID", "Batam", 1.0456, 104.0305, "needs_proxy"),

  P("VN", "Hanoi", 21.0285, 105.8542, "needs_proxy"),
  P("VN", "Ho Chi Minh City", 10.8231, 106.6297, "needs_permission", VN_CEM),
  P("VN", "Da Nang", 16.0544, 108.2022, "needs_permission", VN_CEM),

  P("PH", "Metro Manila", 14.6354, 121.0779, "needs_proxy"),
  P("PH", "Cebu", 10.3157, 123.8854, "needs_permission", PH_EMB),
  P("PH", "Davao", 7.1907, 125.4553, "needs_permission", PH_EMB),

  P("LA", "Vientiane", 17.9757, 102.6331, "needs_proxy"),
  P("LA", "Luang Prabang", 19.8856, 102.1347, "needs_proxy"),

  P("KH", "Phnom Penh", 11.5564, 104.9282, "not_feasible",
    "Cambodia doesn't publish live air-quality readings yet, and there are only a couple of community sensors, too far out to estimate the city."),
  P("KH", "Siem Reap", 13.3671, 103.8448, "not_feasible",
    "Cambodia doesn't publish live air-quality readings yet, and one community sensor isn't enough for an honest estimate."),
  P("MM", "Yangon", 16.8409, 96.1735, "not_feasible",
    "Myanmar has no public air-quality feed, and the only community sensor nearby reads zero, which looks faulty."),
  P("MM", "Mandalay", 21.9588, 96.0891, "not_feasible", "Myanmar has no public air-quality feed, and there are no community sensors here."),
  P("BN", "Bandar Seri Begawan", 4.9031, 114.9398, "not_feasible",
    "Brunei's JASTRe publishes its PSI only as an image, which we can't read reliably. We've asked for a machine-readable feed."),
  P("TL", "Dili", -8.5569, 125.5603, "not_feasible", "There are no public air-quality monitors or community sensors in Dili yet."),
];

/** Countries in picker order: covered first, then the rest. */
export const PICKER_COUNTRIES: readonly CountryCode[] = ["SG", "TH", "MY", "ID", "VN", "PH", "LA", "KH", "MM", "BN", "TL"];

export function citiesOf(cc: CountryCode): CityPlace[] {
  return CITIES.filter((c) => c.country === cc);
}

/** Find a city by slug or name (case-insensitive), optionally within one country. */
export function findCity(query: string, cc?: CountryCode): CityPlace | null {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return CITIES.find((c) => (!cc || c.country === cc) && (c.id === q || c.id.replace(/-/g, "") === q.replace(/-/g, ""))) ?? null;
}

/** The country's default city (registry defaultPlace, or its first city). */
export function defaultCity(cc: CountryCode): CityPlace {
  const d = COUNTRIES[cc].defaultPlace;
  return CITIES.find((c) => c.country === cc && c.name === d.name) ?? citiesOf(cc)[0];
}

export const NOT_AVAILABLE_COPY = {
  headline: "Not available yet",
  needs_permission: "The data exists, but we need the publisher's permission (or a feed we can read) before we can show it.",
  not_feasible: "There isn't a reliable public source here yet.",
} as const;
