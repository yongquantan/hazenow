/**
 * Popular destinations (docs/sea/COVERAGE.md "Popular destinations"): the catalogue, its aliases, and each place's status,
 * re-derived from the live capture of 2026-09-29 02:06 SGT recorded in fixtures/sea/.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { haversineKm } from "../src/math";
import {
  AIR4THAI_ATTRIBUTION,
  CITIES,
  DESTINATIONS,
  DESTINATION_RADIUS_KM,
  PLACES,
  PREVIEW_CAPTURED_AT,
  PICKER_COUNTRIES,
  SMALL_ISLANDS,
  agMapObservations,
  air4thaiObservations,
  bmkgObservations,
  buildCountrySnapshot,
  cityMode,
  citiesOf,
  countryAt,
  coverageLabel,
  crowdQc,
  doeObservations,
  findCity,
  ispuObservations,
  locate,
  notAvailable,
  parseAir4ThaiHistory,
  parseAir4ThaiStations,
  placeGroups,
  placeQuery,
  searchPlaces,
  usableCrowd,
  type CityPlace,
  type CountryCode,
  type Observation,
  type ObservationSet,
} from "../src/countries/index";

const FX = new URL("../fixtures/sea/", import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(FX + f, "utf8"));
const COVERAGE = readFileSync(new URL("../../../docs/sea/COVERAGE.md", import.meta.url).pathname, "utf8");

/** The live capture: 2026-09-28 18:06–18:10 UTC (29 Sep 02:06 SGT). */
const CAP = Date.parse("2026-09-28T18:07:00Z");
const th29 = air4thaiObservations(
  parseAir4ThaiStations(json("th-air4thai-aqi-2026-09-29T01ICT.json")),
  parseAir4ThaiHistory(json("th-air4thai-history-2026-09-29T01ICT.json")),
);
const doe29 = doeObservations(json("my-doe-apims-2026-09-29T02MYT.json"));
// 8 of 68 DOE stations had no reading at 02:00 MYT; they exist (28 Sep capture), so they count for coverage.
const doeAll = [...doe29, ...doeObservations(json("my-doe-apims-2026-09-28T18MYT.json")).filter((o) => !doe29.some((x) => x.stationId === o.stationId))];
const bmkg29 = bmkgObservations(readFileSync(FX + "id-bmkg-pm25-2026-09-29T01WIB.html", "utf8"), CAP);
const ispu29 = ispuObservations(json("id-klh-ispu-2026-09-29T01WIB.json"), CAP);
const crowd29 = crowdQc(agMapObservations(json("ag-map-sea-2026-09-28T1806Z.json")), CAP).filter(usableCrowd);

const OFFICIAL: Partial<Record<CountryCode, Observation[]>> = { TH: th29, MY: doeAll, ID: [...bmkg29, ...ispu29] };
/** Countries whose feed carries community sensors (services/proxy SERVED minus direct-only TH/SG). */
const CROWD_FEED: CountryCode[] = ["MY", "ID", "VN", "PH", "LA"];

const within = (p: CityPlace, list: Observation[], km: number) => list.filter((o) => haversineKm(p, o) <= km);
const reported24h = (o: Observation) =>
  o.grade === "reference" &&
  (o.official != null || o.pm25_1h != null || !!o.history?.some((h) => h.pm25 != null && CAP - Date.parse(h.time) <= 24 * 3600_000));

/** COVERAGE.md's rules, applied to the capture. */
function derive(p: CityPlace): string {
  const off = within(p, (OFFICIAL[p.country] ?? []).filter(reported24h), DESTINATION_RADIUS_KM);
  const crowd = within(p, crowd29.filter((o) => o.country === p.country), 10);
  if (p.country === "TH") return off.length ? "Live now (direct)" : "Not available yet";
  if (p.country === "KH") return "Not available yet";
  if (off.length) return "Needs proxy";
  if (crowd.length >= 2 && CROWD_FEED.includes(p.country)) return "Community sensors only";
  return "Not available yet";
}

/** COVERAGE.md "Popular destinations" tables: name → status. */
function coverageTable(): Map<string, string> {
  const sec = COVERAGE.slice(COVERAGE.indexOf("## Popular destinations"), COVERAGE.indexOf("## TODO"));
  const out = new Map<string, string>();
  for (const line of sec.split("\n")) {
    const m = /^\| \*\*(.+?)\*\*[^|]*\| ([^|]+?) \|/.exec(line);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

const popular = PLACES.filter((p) => p.popular);

describe("destinations: catalogue", () => {
  test("52 new destinations, 74 in the Popular subgroup; the 45 cities are unchanged", () => {
    expect(DESTINATIONS.length).toBe(52);
    expect(popular.length).toBe(74);
    expect(CITIES.length).toBe(45);
    expect(PLACES.length).toBe(45 + 52);
  });

  test("the founder's list is all there", () => {
    const want: [CountryCode, string][] = [
      ["ID", "denpasar"], ["ID", "kuta"], ["ID", "seminyak"], ["ID", "canggu"], ["ID", "ubud"], ["ID", "nusa-dua"], ["ID", "jimbaran"],
      ["ID", "batam"], ["ID", "bintan"], ["ID", "yogyakarta"], ["ID", "bandung"], ["ID", "mataram"], ["ID", "labuan-bajo"],
      ["MY", "penang"], ["MY", "langkawi"], ["MY", "malacca"], ["MY", "ipoh"], ["MY", "cameron-highlands"], ["MY", "genting-highlands"],
      ["MY", "kota-kinabalu"], ["MY", "kuching"], ["MY", "desaru"], ["MY", "johor-bahru"],
      ["TH", "phuket"], ["TH", "krabi"], ["TH", "koh-samui"], ["TH", "pattaya"], ["TH", "hua-hin"], ["TH", "chiang-rai"], ["TH", "pai"],
      ["VN", "da-nang"], ["VN", "hoi-an"], ["VN", "nha-trang"], ["VN", "ho-chi-minh-city"], ["VN", "ha-long"], ["VN", "sapa"], ["VN", "phu-quoc"],
      ["PH", "cebu"], ["PH", "boracay"], ["PH", "el-nido"], ["PH", "puerto-princesa"], ["PH", "siargao"], ["PH", "davao"],
      ["KH", "siem-reap"], ["LA", "luang-prabang"], ["LA", "vang-vieng"],
    ];
    for (const [cc, id] of want) {
      const c = findCity(id, cc);
      expect(`${cc}:${id}:${c?.popular}`).toBe(`${cc}:${id}:true`);
    }
  });

  test("slugs are unique per country; ids resolve back to themselves", () => {
    for (const cc of PICKER_COUNTRIES) {
      const ids = citiesOf(cc).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of citiesOf(cc)) expect(findCity(c.id, cc)).toBe(c);
    }
  });

  test("every destination resolves to its own country (border lookup, incl. small islands)", () => {
    for (const c of popular) expect(`${c.name}:${countryAt(c.lat, c.lon)}`).toBe(`${c.name}:${c.country}`);
    expect(countryAt(7.7407, 98.7784)).toBe("TH"); // Ko Phi Phi
    expect(countryAt(10.0956, 99.8404)).toBe("TH"); // Ko Tao
    // The island supplement never claims a point in another country.
    for (const [cc, lat, lon] of SMALL_ISLANDS) expect(locate(lat, lon).country).toBe(cc);
    // Singapore-adjacent: Batam and Bintan are Indonesia, JB and Desaru Malaysia, Singapore stays Singapore.
    expect(countryAt(1.0456, 104.0305)).toBe("ID");
    expect(countryAt(1.183, 104.348)).toBe("ID");
    expect(countryAt(1.4927, 103.7414)).toBe("MY");
    expect(countryAt(1.56, 104.26)).toBe("MY");
    expect(countryAt(1.35735, 103.82)).toBe("SG");
  });

  test("blocked destinations carry a reason and what would fix it; available ones don't need a reason", () => {
    for (const c of DESTINATIONS) {
      if (c.status === "not_feasible" || c.status === "needs_permission") {
        expect(c.reason?.length).toBeGreaterThan(30);
        expect(c.fix?.length).toBeGreaterThan(10);
        expect(notAvailable(c).fix).toBe(c.fix!);
        expect(cityMode(c, true)).toBe("unavailable");
      } else {
        expect(c.reason).toBeUndefined();
        expect(cityMode(c, true)).toBe("live");
      }
    }
  });

  test("picker groups: Popular first, Bali kept together, cities after", () => {
    const id = placeGroups("ID");
    const names = id.popular.map((c) => c.name);
    const bali = names.indexOf("Denpasar");
    expect(names.slice(bali, bali + 9)).toEqual(["Denpasar", "Canggu", "Seminyak", "Kuta", "Sanur", "Ubud", "Jimbaran", "Nusa Dua", "Uluwatu"]);
    expect(id.others.map((c) => c.name)).toContain("Jakarta");
    expect(id.others.some((c) => c.popular)).toBe(false);
    expect(placeGroups("TH").popular[0].name).toBe("Bangkok");
    expect(placeGroups("SG").popular).toEqual([]);
  });
});

describe("destinations: aliases and search", () => {
  test("findCity takes names, slugs and aliases (deep links)", () => {
    expect(findCity("Bali")?.name).toBe("Denpasar");
    expect(findCity("bali", "ID")?.name).toBe("Denpasar");
    expect(findCity("Seminyak")?.id).toBe("seminyak");
    expect(findCity("Kuta")?.region).toBe("Bali");
    expect(findCity("kuta-lombok", "ID")?.region).toBe("Lombok");
    expect(findCity("Penang")?.country).toBe("MY");
    expect(findCity("George Town")?.name).toBe("Penang");
    expect(findCity("KL")?.name).toBe("Kuala Lumpur");
    expect(findCity("kl", "MY")?.name).toBe("Kuala Lumpur");
    expect(findCity("JB")?.name).toBe("Johor Bahru");
    expect(findCity("Saigon")?.name).toBe("Ho Chi Minh City");
    expect(findCity("Koh Samui")?.name).toBe("Koh Samui");
    expect(findCity("ko-samui", "TH")?.name).toBe("Koh Samui");
    expect(findCity("Jogja")?.name).toBe("Yogyakarta");
    expect(findCity("Melaka")?.name).toBe("Malacca");
    expect(findCity("Lagoi")?.name).toBe("Bintan");
    expect(findCity("KL", "TH")).toBeNull();
    expect(findCity("Singapore")?.country).toBe("SG");
  });

  test('"Bali" lists all of Bali, Denpasar first; other searches find their place first', () => {
    const bali = searchPlaces("Bali", 20).map((h) => h.place.name);
    expect(bali[0]).toBe("Denpasar");
    for (const n of ["Canggu", "Seminyak", "Kuta", "Sanur", "Ubud", "Jimbaran", "Nusa Dua", "Uluwatu"]) expect(bali).toContain(n);
    expect(bali.slice(0, 9).every((n) => findCity(n, "ID")?.region === "Bali")).toBe(true); // then Balikpapan (name prefix)
    const first = (q: string) => searchPlaces(q)[0]?.place.name;
    expect(first("Seminyak")).toBe("Seminyak");
    expect(first("Kuta")).toBe("Kuta");
    expect(searchPlaces("Kuta").map((h) => h.place.name)).toContain("Kuta (Lombok)");
    expect(first("Penang")).toBe("Penang");
    expect(searchPlaces("Penang").map((h) => h.place.name)).toContain("Batu Ferringhi");
    expect(first("KL")).toBe("Kuala Lumpur");
    expect(searchPlaces("KL")[0].matched).toBe("KL");
    expect(first("pen")).toBe("Penang");
    expect(first("samui")).toBe("Koh Samui");
    expect(first("Ko Tao")).toBe("Koh Tao");
    expect(first("hoi an")).toBe("Hoi An");
    expect(first("Palawan")).toBe("El Nido");
    expect(first("Lombok")).toBe("Mataram");
    // Singapore areas stay in Singapore's own search; the regional search never returns SG.
    expect(searchPlaces("Singapore")).toEqual([]);
    expect(searchPlaces("")).toEqual([]);
  });
});

describe("destinations: status follows COVERAGE.md and the live capture", () => {
  test("every destination has the status COVERAGE.md's table says (and the table lists exactly these)", () => {
    const doc = coverageTable();
    expect(doc.size).toBe(popular.length);
    for (const c of popular) expect(`${c.name}: ${doc.get(c.name)}`).toBe(`${c.name}: ${coverageLabel(c)}`);
  });

  test("statuses re-derive from the 29 Sep capture (25 km official, ≥ 2 sensors ≤ 10 km, same country)", () => {
    for (const c of popular) {
      if (c.id === "hanoi") continue; // moitruongthudo wasn't re-fetched; Hanoi keeps its 28 Sep verification
      expect(`${c.country} ${c.name}: ${derive(c)}`).toBe(`${c.country} ${c.name}: ${coverageLabel(c)}`);
    }
  });

  test("available destinations build a snapshot from their own country only, never beyond the radius", () => {
    const sets: Partial<Record<CountryCode, ObservationSet>> = {
      TH: { country: "TH", adapters: [], fetchedAt: "", observations: th29, attribution: [AIR4THAI_ATTRIBUTION] },
    };
    const all = { MY: [...doe29, ...crowd29], ID: [...bmkg29, ...ispu29, ...crowd29], VN: crowd29, PH: crowd29, LA: crowd29 } as const;
    for (const [cc, obs] of Object.entries(all)) {
      sets[cc as CountryCode] = { country: cc as CountryCode, adapters: [], fetchedAt: "", observations: [...obs], attribution: [] };
    }
    for (const c of popular) {
      if (cityMode(c, true) !== "live" || c.id === "hanoi") continue;
      const s = buildCountrySnapshot(sets[c.country]!, placeQuery(c), CAP);
      expect(s.country).toBe(c.country);
      for (const st of s.stations) expect(st.distanceKm!).toBeLessThanOrEqual(DESTINATION_RADIUS_KM);
      expect(s.notes).not.toContain("nearest_far");
      if (s.pm25Kind === "crowd_estimate") expect(s.nearest!.distanceKm!).toBeLessThanOrEqual(10);
      // Something honest to show: a number, or the authority's own index.
      expect(`${c.name}:${s.pm25 !== null || s.official !== null}`).toBe(`${c.name}:true`);
      if (c.crowdOnly) expect(`${c.name}:${s.pm25Kind}`).toBe(`${c.name}:crowd_estimate`);
    }
  });

  test("withinKm never stretches a far station: Phuket keeps its own (late) station, Phi Phi and Bintan get nothing", () => {
    const set: ObservationSet = { country: "TH", adapters: [], fetchedAt: "", observations: th29, attribution: [AIR4THAI_ATTRIBUTION] };
    const phuket = findCity("phuket", "TH")!;
    // Default rules: the 0.5 km station is dropped as stale and nothing fresh is within 60 km → no number at all.
    const loose = buildCountrySnapshot(set, { lat: phuket.lat, lon: phuket.lon }, CAP);
    expect(loose.pm25).toBeNull();
    const phiphi = findCity("koh-phi-phi", "TH")!;
    const stretched = buildCountrySnapshot(set, { lat: phiphi.lat, lon: phiphi.lon }, CAP);
    expect(stretched.notes).toContain("nearest_far"); // Krabi town's station, 38 km: what the radius prevents
    const pp = buildCountrySnapshot(set, placeQuery(phiphi), CAP);
    expect(pp.pm25).toBeNull();
    expect(pp.stations).toEqual([]);
    const tight = buildCountrySnapshot(set, placeQuery(phuket), CAP);
    expect(tight.nearest?.name).toBe("Municipal Health Center");
    expect(tight.nearest!.distanceKm!).toBeLessThan(1);
    expect(tight.stale).toBe(true); // 17:00 ICT, and the app says so
    expect(tight.notes).not.toContain("nearest_far");

    const idSet: ObservationSet = { country: "ID", adapters: [], fetchedAt: "", observations: [...bmkg29, ...ispu29, ...crowd29], attribution: [] };
    const bintan = findCity("bintan", "ID")!;
    expect(buildCountrySnapshot(idSet, { lat: bintan.lat, lon: bintan.lon }, CAP).pm25).not.toBeNull(); // BMKG Batam, 26 km
    const b = buildCountrySnapshot(idSet, { lat: bintan.lat, lon: bintan.lon, withinKm: DESTINATION_RADIUS_KM }, CAP);
    expect(b.pm25).toBeNull();
    expect(b.official).toBeNull();
    expect(b.stations).toEqual([]);
  });

  test("placeQuery: destinations get the radius, other cities keep the SPEC defaults", () => {
    expect(placeQuery(findCity("canggu", "ID")!).withinKm).toBe(25);
    expect(placeQuery(findCity("surabaya", "ID")!).withinKm).toBeUndefined();
  });
});

describe("destinations: Bali in Preview (recorded 28 Sep set)", () => {
  const set: ObservationSet = json("preview/id.json");
  const NOW = Date.parse(PREVIEW_CAPTURED_AT);
  test("Canggu, Seminyak, Ubud, Denpasar: community estimate with a range and the ISPU line; Uluwatu crowd only", () => {
    for (const id of ["canggu", "seminyak", "ubud", "denpasar"]) {
      const s = buildCountrySnapshot(set, placeQuery(findCity(id, "ID")!), NOW);
      expect(s.pm25Kind).toBe("crowd_estimate");
      expect(s.range).not.toBeNull();
      expect(s.official?.name).toBe("ISPU");
      expect(s.stations.every((x) => x.distanceKm! <= 25)).toBe(true);
    }
    const u = buildCountrySnapshot(set, placeQuery(findCity("uluwatu", "ID")!), NOW);
    expect(u.pm25Kind).toBe("crowd_estimate");
    expect(u.official).toBeNull();
    const nd = buildCountrySnapshot(set, placeQuery(findCity("nusa-dua", "ID")!), NOW);
    expect(nd.pm25).toBeNull();
    expect(nd.official?.name).toBe("ISPU");
  });
});
