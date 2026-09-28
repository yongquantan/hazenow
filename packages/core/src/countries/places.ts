/**
 * Place catalogue for the country picker (docs/sea/COVERAGE.md).
 * - CITIES: the major cities, verified 2026-09-28.
 * - DESTINATIONS: popular tourist, weekend-trip and expat places, verified live 2026-09-29 (COVERAGE.md "Popular
 *   destinations"). A destination is only available when an official station is within 25 km or community sensors
 *   are within 10 km, in the same country. Nothing farther is stretched to cover it (`withinKm`), and a far place says
 *   "Not available yet" with what would fix it.
 * Each place carries its coverage status; blocked places carry a plain-language reason for a calm "Not available yet"
 * state. Coordinates are the points COVERAGE.md measured from.
 */
import { COUNTRIES } from "./registry.js";
import type { CountryCode, CountryQuery, CoverageStatus } from "./types.js";

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
  /** Shown in the picker's "Popular" subgroup (tourist, weekend-trip and expat places). */
  popular?: boolean;
  /** Other names people search for ("Bali", "KL", "George Town", "Koh Samui"). */
  aliases?: readonly string[];
  /** Island or area it belongs to, shown small and searchable ("Bali", "Lombok", "Palawan"). */
  region?: string;
  /** No official station close enough: the number is a community-sensor estimate ("Community sensors only"). */
  crowdOnly?: boolean;
  /** For a place that isn't available yet: what would fix it ("Two community sensors in Tanah Rata"). */
  fix?: string;
}

interface Extra {
  popular?: boolean;
  aliases?: readonly string[];
  region?: string;
  crowdOnly?: boolean;
  fix?: string;
}

export const slugOf = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const P = (country: CountryCode, name: string, lat: number, lon: number, status: CoverageStatus, reason?: string, extra: Extra = {}): CityPlace => {
  const c: CityPlace = { country, id: slugOf(name), name, lat, lon, status, reason };
  if (extra.popular) c.popular = true;
  if (extra.aliases?.length) c.aliases = extra.aliases;
  if (extra.region) c.region = extra.region;
  if (extra.crowdOnly) c.crowdOnly = true;
  if (extra.fix) c.fix = extra.fix;
  return c;
};

/** Popular destination (always in the "Popular" subgroup). */
const D = (country: CountryCode, name: string, lat: number, lon: number, status: CoverageStatus, extra: Extra & { reason?: string } = {}): CityPlace =>
  P(country, name, lat, lon, status, extra.reason, { ...extra, popular: true });

/** Too far from any station or sensor we can read: calm reason + what would fix it. */
const far = (reason: string, fix: string) => ({ reason, fix });

const PH_EMB =
  "The Philippines' air-quality site (DENR-EMB) blocks automated access, and there are no community sensors here yet. We've asked EMB for a data feed.";
const VN_CEM =
  "Vietnam's national monitoring site (CEM) is behind a CAPTCHA, so we can't read it yet. We're asking CEM for a data agreement.";

export const CITIES: readonly CityPlace[] = [
  P("SG", "Singapore", 1.35735, 103.82, "live_direct"),

  P("TH", "Bangkok", 13.7563, 100.5018, "live_direct", undefined, { popular: true, aliases: ["BKK", "Krung Thep"] }),
  P("TH", "Chiang Mai", 18.7883, 98.9853, "live_direct", undefined, { popular: true }),
  P("TH", "Chiang Rai", 19.9105, 99.8406, "live_direct", undefined, { popular: true }),
  P("TH", "Phuket", 7.8804, 98.3923, "live_direct", undefined, { popular: true, aliases: ["Phuket Town"], region: "Phuket" }),
  P("TH", "Hat Yai", 7.0086, 100.4747, "live_direct"),
  P("TH", "Khon Kaen", 16.4322, 102.8236, "live_direct"),
  P("TH", "Pattaya", 12.9236, 100.8825, "live_direct", undefined, { popular: true, aliases: ["Jomtien"] }),
  P("TH", "Nakhon Ratchasima", 14.9799, 102.0978, "live_direct"),
  P("TH", "Udon Thani", 17.4138, 102.787, "live_direct"),

  P("MY", "Kuala Lumpur", 3.139, 101.6869, "needs_proxy", undefined, { popular: true, aliases: ["KL", "Klang Valley"] }),
  P("MY", "Johor Bahru", 1.4927, 103.7414, "needs_proxy", undefined, { popular: true, aliases: ["JB", "Johor"] }),
  P("MY", "Penang", 5.4141, 100.3288, "needs_proxy", undefined, { popular: true, aliases: ["George Town", "Georgetown", "Pulau Pinang"], region: "Penang" }),
  P("MY", "Ipoh", 4.5975, 101.0901, "needs_proxy", undefined, { popular: true }),
  P("MY", "Malacca", 2.1896, 102.2501, "needs_proxy", undefined, { popular: true, aliases: ["Melaka"] }),
  P("MY", "Kuching", 1.5535, 110.3593, "needs_proxy", undefined, { popular: true, region: "Sarawak" }),
  P("MY", "Kota Kinabalu", 5.9804, 116.0735, "needs_proxy", undefined, { popular: true, aliases: ["KK"], region: "Sabah" }),

  P("ID", "Jakarta", -6.2088, 106.8456, "needs_proxy"),
  P("ID", "Surabaya", -7.2575, 112.7521, "needs_proxy"),
  P("ID", "Bandung", -6.9175, 107.6191, "needs_proxy", undefined, { popular: true }),
  P("ID", "Medan", 3.5952, 98.6722, "needs_proxy"),
  P("ID", "Palembang", -2.9761, 104.7754, "needs_proxy"),
  P("ID", "Jambi", -1.6101, 103.6131, "needs_proxy"),
  P("ID", "Pekanbaru", 0.5071, 101.4478, "needs_proxy"),
  P("ID", "Pontianak", -0.0263, 109.3425, "needs_proxy"),
  P("ID", "Palangka Raya", -2.2161, 113.9135, "needs_proxy"),
  P("ID", "Balikpapan", -1.2379, 116.8529, "needs_proxy"),
  P("ID", "Samarinda", -0.5022, 117.1536, "needs_proxy"),
  P("ID", "Makassar", -5.1477, 119.4327, "needs_proxy"),
  P("ID", "Denpasar", -8.6705, 115.2126, "needs_proxy", undefined, { popular: true, aliases: ["Bali"], region: "Bali" }),
  P("ID", "Batam", 1.0456, 104.0305, "needs_proxy", undefined, { popular: true, aliases: ["Nongsa", "Batam Centre"], region: "Riau Islands" }),

  P("VN", "Hanoi", 21.0285, 105.8542, "needs_proxy", undefined, { popular: true, aliases: ["Ha Noi"] }),
  P("VN", "Ho Chi Minh City", 10.8231, 106.6297, "needs_permission", VN_CEM, {
    popular: true, aliases: ["Saigon", "HCMC", "Ho Chi Minh"], fix: "One more community sensor within 10 km (there's one 6 km out), or a CEM data agreement.",
  }),
  P("VN", "Da Nang", 16.0544, 108.2022, "needs_permission", VN_CEM, { popular: true, aliases: ["Danang"], fix: "Two community sensors in Da Nang, or a CEM data agreement." }),

  P("PH", "Metro Manila", 14.6354, 121.0779, "needs_proxy", undefined, { crowdOnly: true, aliases: ["Manila", "NCR"] }),
  P("PH", "Cebu", 10.3157, 123.8854, "needs_permission", PH_EMB, { popular: true, aliases: ["Cebu City", "Mactan"], fix: "Two community sensors in Cebu City, or an EMB data feed." }),
  P("PH", "Davao", 7.1907, 125.4553, "needs_permission", PH_EMB, { popular: true, aliases: ["Davao City"], fix: "Two community sensors in Davao City, or an EMB data feed." }),

  P("LA", "Vientiane", 17.9757, 102.6331, "needs_proxy", undefined, { crowdOnly: true }),
  P("LA", "Luang Prabang", 19.8856, 102.1347, "needs_proxy", undefined, { popular: true, crowdOnly: true, aliases: ["Luang Phrabang"] }),

  P("KH", "Phnom Penh", 11.5564, 104.9282, "not_feasible",
    "Cambodia doesn't publish live air-quality readings yet, and there are only a couple of community sensors, too far out to estimate the city."),
  P("KH", "Siem Reap", 13.3671, 103.8448, "not_feasible",
    "Cambodia doesn't publish live air-quality readings yet, and one community sensor isn't enough for an honest estimate.",
    { popular: true, aliases: ["Angkor", "Angkor Wat"], fix: "One more community sensor in Siem Reap, and a way to read Cambodia's sensors (HazeNow has no Cambodia feed yet)." }),
  P("MM", "Yangon", 16.8409, 96.1735, "not_feasible",
    "Myanmar has no public air-quality feed, and the only community sensor nearby reads zero, which looks faulty."),
  P("MM", "Mandalay", 21.9588, 96.0891, "not_feasible", "Myanmar has no public air-quality feed, and there are no community sensors here."),
  P("BN", "Bandar Seri Begawan", 4.9031, 114.9398, "not_feasible",
    "Brunei's JASTRe publishes its PSI only as an image, which we can't read reliably. We've asked for a machine-readable feed."),
  P("TL", "Dili", -8.5569, 125.5603, "not_feasible", "There are no public air-quality monitors or community sensors in Dili yet."),
];

const KH_NONE = "Cambodia doesn't publish live air-quality readings yet, and there are no community sensors here.";
const VN_NONE = (place: string) =>
  `Vietnam's national monitoring site (CEM) is behind a CAPTCHA, and there are no community sensors in ${place} yet.`;
const PH_NONE = (place: string) =>
  `The Philippines' air-quality site (DENR-EMB) blocks automated access, and there are no community sensors in ${place} yet.`;
const TH_FAR = (km: number, station: string) =>
  `Thailand's nearest PCD station is ${station}, ${km} km away. That's too far to stand for the air here.`;

/**
 * Popular destinations (COVERAGE.md "Popular destinations", verified live 2026-09-29 01:06–02:10 SGT).
 * Distances in the reasons are from the point given here.
 */
export const DESTINATIONS: readonly CityPlace[] = [
  // Indonesia · Bali (AirGradient community sensors + KLH ISPU Badung Sempidi; no BMKG 1-hr station on Bali)
  D("ID", "Canggu", -8.6478, 115.1385, "needs_proxy", { region: "Bali", aliases: ["Bali", "Pererenan", "Berawa", "Echo Beach"] }),
  D("ID", "Seminyak", -8.6913, 115.1683, "needs_proxy", { region: "Bali", aliases: ["Bali", "Kerobokan", "Umalas", "Petitenget"] }),
  D("ID", "Kuta", -8.718, 115.1686, "needs_proxy", { region: "Bali", aliases: ["Bali", "Legian", "Tuban"] }),
  D("ID", "Sanur", -8.6878, 115.262, "needs_proxy", { region: "Bali", aliases: ["Bali"] }),
  D("ID", "Ubud", -8.5069, 115.2625, "needs_proxy", { region: "Bali", aliases: ["Bali"] }),
  D("ID", "Jimbaran", -8.7907, 115.16, "needs_proxy", { region: "Bali", aliases: ["Bali"] }),
  D("ID", "Nusa Dua", -8.8008, 115.2317, "needs_proxy", {
    region: "Bali", aliases: ["Bali", "Tanjung Benoa"], fix: "One community sensor in Nusa Dua would add an hourly number (today it gets ISPU's 24-hr index only).",
  }),
  D("ID", "Uluwatu", -8.8291, 115.0849, "needs_proxy", { region: "Bali", crowdOnly: true, aliases: ["Bali", "Bingin", "Padang Padang", "Pecatu"] }),
  D("ID", "Bintan", 1.183, 104.348, "not_feasible", {
    region: "Riau Islands", aliases: ["Lagoi", "Bintan Resorts"],
    ...far("The nearest official monitor is BMKG's in Batam, 26 km away across the water, and there are no community sensors on Bintan yet.",
      "Two community sensors at Lagoi would cover the resorts."),
  }),
  D("ID", "Tanjung Pinang", 0.9186, 104.4665, "not_feasible", {
    region: "Riau Islands", aliases: ["Tanjungpinang", "Bintan"],
    ...far("The nearest official monitor is BMKG's in Batam, 44 km away, and there are no community sensors here yet.", "Two community sensors in Tanjung Pinang."),
  }),
  D("ID", "Yogyakarta", -7.7956, 110.3695, "needs_proxy", { aliases: ["Jogja", "Jogjakarta", "Yogya", "Borobudur"] }),
  D("ID", "Mataram", -8.5833, 116.1167, "not_feasible", {
    region: "Lombok", aliases: ["Lombok"],
    ...far("Lombok has no official monitor, and there are no community sensors on the island yet. The nearest are in Bali, over 90 km away.",
      "Two community sensors in Mataram."),
  }),
  D("ID", "Senggigi", -8.491, 116.042, "not_feasible", {
    region: "Lombok", aliases: ["Lombok"],
    ...far("Lombok has no official monitor, and there are no community sensors on the island yet.", "Two community sensors in Senggigi."),
  }),
  D("ID", "Gili Trawangan", -8.35, 116.038, "not_feasible", {
    region: "Lombok", aliases: ["Gili", "Gili T", "Gili Islands", "Gili Air", "Gili Meno", "Lombok"],
    ...far("There's no official monitor or community sensor on the Gili Islands or Lombok yet.", "Two community sensors on Gili Trawangan."),
  }),
  D("ID", "Kuta (Lombok)", -8.895, 116.277, "not_feasible", {
    region: "Lombok", aliases: ["Kuta Lombok", "Mandalika", "Lombok"],
    ...far("Lombok has no official monitor, and there are no community sensors on the island yet.", "Two community sensors in Kuta or Mandalika."),
  }),
  D("ID", "Labuan Bajo", -8.4964, 119.8877, "needs_proxy", {
    aliases: ["Komodo", "Flores"], fix: "One community sensor in town would add an hourly number (today it gets ISPU's 24-hr index only).",
  }),

  // Malaysia (DOE APIMS: 24-hr based API, no 1-hr PM2.5)
  D("MY", "Batu Ferringhi", 5.471, 100.246, "needs_proxy", { region: "Penang", aliases: ["Penang"] }),
  D("MY", "Langkawi", 6.35, 99.8, "needs_proxy", { aliases: ["Pantai Cenang", "Kuah"] }),
  D("MY", "Cameron Highlands", 4.47, 101.377, "not_feasible", {
    aliases: ["Cameron", "Tanah Rata", "Brinchang"],
    ...far("The nearest DOE station is in Ipoh, 34 km away and 1,400 m lower, so it can't stand for the highlands. There are no community sensors here yet.",
      "Two community sensors in Tanah Rata."),
  }),
  D("MY", "Genting Highlands", 3.4236, 101.7932, "not_feasible", {
    aliases: ["Genting", "Resorts World Genting"],
    ...far("The nearest DOE station and community sensors are in Kuala Lumpur, about 27 km away and far below the hilltop.", "Two community sensors at Genting."),
  }),
  D("MY", "Desaru", 1.56, 104.26, "needs_proxy", { aliases: ["Desaru Coast", "Bandar Penawar", "Kota Tinggi"] }),
  D("MY", "Tioman", 2.82, 104.16, "not_feasible", {
    aliases: ["Pulau Tioman", "Tekek"],
    ...far("The nearest DOE station is at Rompin on the mainland, 83 km away, and there are no community sensors on the island.", "Two community sensors at Tekek or ABC."),
  }),
  D("MY", "Port Dickson", 2.5225, 101.7963, "needs_proxy", { aliases: ["PD"] }),

  // Thailand (PCD Air4Thai, direct. HazeNow's Thai feed is official stations only)
  D("TH", "Patong", 7.8961, 98.2966, "live_direct", { region: "Phuket", aliases: ["Phuket", "Kata", "Karon"] }),
  D("TH", "Krabi", 8.0863, 98.9063, "live_direct", { aliases: ["Krabi Town"] }),
  D("TH", "Ao Nang", 8.0321, 98.8229, "live_direct", { region: "Krabi", aliases: ["Krabi", "Railay"] }),
  D("TH", "Koh Phi Phi", 7.7407, 98.7784, "not_feasible", {
    region: "Krabi", aliases: ["Ko Phi Phi", "Phi Phi"], ...far(TH_FAR(38, "in Krabi town"), "A PCD station on Phi Phi Don (or community sensors, once HazeNow's Thai feed reads them)."),
  }),
  D("TH", "Koh Lanta", 7.625, 99.079, "not_feasible", {
    region: "Krabi", aliases: ["Ko Lanta", "Lanta"], ...far(TH_FAR(51, "in Krabi town"), "A PCD station on Koh Lanta (or community sensors, once HazeNow's Thai feed reads them)."),
  }),
  D("TH", "Koh Samui", 9.53, 100.06, "not_feasible", {
    aliases: ["Ko Samui", "Samui", "Chaweng", "Lamai"], ...far(TH_FAR(92, "in Surat Thani"), "A PCD station on Samui (or community sensors, once HazeNow's Thai feed reads them)."),
  }),
  D("TH", "Koh Phangan", 9.738, 100.013, "not_feasible", {
    aliases: ["Ko Phangan", "Ko Pha-ngan", "Phangan"], ...far(TH_FAR(102, "in Surat Thani"), "A PCD station on Koh Phangan (or community sensors, once HazeNow's Thai feed reads them)."),
  }),
  D("TH", "Koh Tao", 10.0956, 99.8404, "not_feasible", {
    aliases: ["Ko Tao"], ...far(TH_FAR(84, "in Chumphon"), "A PCD station on Koh Tao (or community sensors, once HazeNow's Thai feed reads them)."),
  }),
  D("TH", "Hua Hin", 12.5684, 99.9577, "live_direct"),
  D("TH", "Pai", 19.3587, 98.44, "not_feasible", {
    ...far("Pai has about 20 community sensors, but HazeNow only reads PCD's official stations in Thailand today, and the nearest is in Mae Hong Son, 50 km away.",
      "Adding community sensors to HazeNow's Thai feed (through our server) would cover Pai."),
  }),
  D("TH", "Ayutthaya", 14.3532, 100.5689, "live_direct"),
  D("TH", "Kanchanaburi", 14.0228, 99.5328, "live_direct"),
  D("TH", "Koh Chang", 12.05, 102.33, "not_feasible", {
    aliases: ["Ko Chang"], ...far(TH_FAR(29, "in Trat"), "A PCD station on Koh Chang (or community sensors, once HazeNow's Thai feed reads them)."),
  }),

  // Vietnam (CEM CAPTCHA-walled; AirGradient only)
  D("VN", "Hoi An", 15.8801, 108.338, "not_feasible", { aliases: ["Hội An"], ...far(VN_NONE("Hoi An"), "Two community sensors in Hoi An (or a CEM data agreement).") }),
  D("VN", "Hue", 16.4637, 107.5909, "not_feasible", { aliases: ["Huế"], ...far(VN_NONE("Hue"), "Two community sensors in Hue (or a CEM data agreement).") }),
  D("VN", "Nha Trang", 12.2388, 109.1967, "not_feasible", { ...far(VN_NONE("Nha Trang"), "Two community sensors in Nha Trang (or a CEM data agreement).") }),
  D("VN", "Da Lat", 11.9404, 108.4583, "not_feasible", { aliases: ["Dalat"], ...far(VN_NONE("Da Lat"), "Two community sensors in Da Lat (or a CEM data agreement).") }),
  D("VN", "Ha Long", 20.9517, 107.08, "not_feasible", {
    aliases: ["Halong", "Ha Long Bay", "Halong Bay"], ...far(VN_NONE("Ha Long"), "Two community sensors in Ha Long (or a CEM data agreement)."),
  }),
  D("VN", "Sapa", 22.3364, 103.8438, "not_feasible", { aliases: ["Sa Pa"], ...far(VN_NONE("Sapa"), "Two community sensors in Sapa (or a CEM data agreement).") }),
  D("VN", "Phu Quoc", 10.217, 103.96, "not_feasible", { aliases: ["Duong Dong"], ...far(VN_NONE("Phu Quoc"), "Two community sensors on Phu Quoc (or a CEM data agreement).") }),

  // Philippines (EMB blocked; AirGradient only)
  D("PH", "Boracay", 11.9674, 121.9248, "not_feasible", { aliases: ["Malay", "Aklan"], ...far(PH_NONE("Boracay"), "Two community sensors on Boracay.") }),
  D("PH", "El Nido", 11.1956, 119.4075, "not_feasible", { region: "Palawan", aliases: ["Palawan"], ...far(PH_NONE("El Nido"), "Two community sensors in El Nido.") }),
  D("PH", "Coron", 12.0, 120.204, "not_feasible", { region: "Palawan", aliases: ["Palawan", "Busuanga"], ...far(PH_NONE("Coron"), "Two community sensors in Coron.") }),
  D("PH", "Puerto Princesa", 9.7392, 118.7353, "not_feasible", {
    region: "Palawan", aliases: ["Palawan"], ...far(PH_NONE("Puerto Princesa"), "Two community sensors in Puerto Princesa."),
  }),
  D("PH", "Siargao", 9.7836, 126.1569, "not_feasible", { aliases: ["General Luna", "Cloud 9"], ...far(PH_NONE("Siargao"), "Two community sensors in General Luna.") }),
  D("PH", "Panglao", 9.58, 123.75, "not_feasible", { region: "Bohol", aliases: ["Bohol", "Alona Beach"], ...far(PH_NONE("Bohol"), "Two community sensors on Panglao.") }),

  // Cambodia (no feed) and Laos (AirGradient / UNICEF schools)
  D("KH", "Sihanoukville", 10.6093, 103.5296, "not_feasible", { aliases: ["Kampong Som", "Koh Rong"], ...far(KH_NONE, "A way to read Cambodia's sensors, plus two sensors in Sihanoukville.") }),
  D("KH", "Kampot", 10.6104, 104.1815, "not_feasible", { aliases: ["Kep"], ...far(KH_NONE, "A way to read Cambodia's sensors, plus two sensors in Kampot.") }),
  D("LA", "Vang Vieng", 18.9235, 102.4478, "not_feasible", {
    ...far("The nearest community sensor is 11.5 km out of town, just past the 10 km we trust for an estimate, and Laos publishes no official readings.",
      "Two community sensors in Vang Vieng town."),
  }),
];

/** Every place in the picker: the major cities, then the destinations. */
export const PLACES: readonly CityPlace[] = [...CITIES, ...DESTINATIONS];

/** Radius for a destination: an official station within 25 km or sensors within 10 km, never farther (COVERAGE.md). */
export const DESTINATION_RADIUS_KM = 25;

/** Countries in picker order: covered first, then the rest. */
export const PICKER_COUNTRIES: readonly CountryCode[] = ["SG", "TH", "MY", "ID", "VN", "PH", "LA", "KH", "MM", "BN", "TL"];

/** All places in a country, major cities first. */
export function citiesOf(cc: CountryCode): CityPlace[] {
  return PLACES.filter((c) => c.country === cc);
}

/** The "Popular" subgroup and the other cities, for the picker. */
export function placeGroups(cc: CountryCode): { popular: CityPlace[]; others: CityPlace[] } {
  const all = citiesOf(cc);
  // Keep an island or area together (Denpasar, then the rest of Bali), in first-appearance order.
  const pop = all.filter((c) => c.popular);
  const key = (c: CityPlace) => (c.region ?? c.name).toLowerCase();
  const order = [...new Set(pop.map(key))];
  const popular = order.flatMap((k) => pop.filter((c) => key(c) === k));
  return { popular, others: all.filter((c) => !c.popular) };
}

/** Search key: lower case, accents and punctuation dropped, "koh" folded to "ko". */
export function searchKey(s: string): string {
  return slugOf(s).replace(/-/g, " ").replace(/\bkoh\b/g, "ko").trim();
}

/** Find a place by slug, name or alias (case-insensitive), optionally within one country. Names win over aliases. */
export function findCity(query: string, cc?: CountryCode): CityPlace | null {
  const q = slugOf(query);
  if (!q) return null;
  const pool = PLACES.filter((c) => !cc || c.country === cc);
  const flat = (x: string) => x.replace(/-/g, "");
  return (
    pool.find((c) => c.id === q || flat(c.id) === flat(q)) ??
    pool.find((c) => c.aliases?.some((a) => slugOf(a) === q || flat(slugOf(a)) === flat(q))) ??
    null
  );
}

export interface PlaceMatch {
  place: CityPlace;
  /** The alias or region that matched, when it wasn't the name ("Bali", "KL"). */
  matched: string | null;
}

/**
 * Picker search across every country: exact name, exact alias/region, name prefix, alias prefix, then substring. "Bali" lists all of Bali
 * (Denpasar first), "KL" finds Kuala Lumpur, "Seminyak" finds Seminyak.
 */
export function searchPlaces(query: string, limit = 12, cc?: CountryCode): PlaceMatch[] {
  const q = searchKey(query);
  if (!q) return [];
  const scored: { m: PlaceMatch; score: number; i: number }[] = [];
  PLACES.forEach((c, i) => {
    if (cc && c.country !== cc) return;
    if (c.country === "SG") return;
    const name = searchKey(c.name);
    const alts = [...(c.aliases ?? []), ...(c.region ? [c.region] : [])];
    let score = -1;
    let matched: string | null = null;
    const exact = alts.find((x) => searchKey(x) === q);
    const prefix = alts.find((x) => searchKey(x).startsWith(q));
    if (name === q) score = 0;
    else if (exact) [score, matched] = [1, exact];
    else if (name.startsWith(q)) score = 2;
    else if (prefix) [score, matched] = [3, prefix];
    else if (q.length >= 3 && name.includes(q)) score = 4;
    if (score >= 0) scored.push({ m: { place: c, matched }, score, i });
  });
  scored.sort((a, b) => a.score - b.score || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.m);
}

/** Query for a picked place: its point, and for a destination the hard radius (no far station is stretched). */
export function placeQuery(c: CityPlace): CountryQuery {
  return c.popular ? { lat: c.lat, lon: c.lon, withinKm: DESTINATION_RADIUS_KM } : { lat: c.lat, lon: c.lon };
}

/** Coverage in COVERAGE.md words. */
export type CoverageLabel = "Live now (direct)" | "Needs proxy" | "Community sensors only" | "Not available yet";

export function coverageLabel(c: Pick<CityPlace, "status" | "crowdOnly">): CoverageLabel {
  if (c.status === "live_direct") return "Live now (direct)";
  if (c.status === "needs_proxy") return c.crowdOnly ? "Community sensors only" : "Needs proxy";
  return "Not available yet";
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
