/**
 * SPEC v2.0 — Southeast Asia. Fixtures in fixtures/sea/ were recorded live on 2026-09-28 between 10:27 and
 * 10:35 UTC (18:27–18:35 SGT) from the real upstreams; they are trimmed, not edited.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildSnapshot, clearCache, getSnapshot, type ApiResponse, type FetchLike as V1FetchLike } from "../src/index";
import {
  ADAPTERS,
  AG_ATTRIBUTION,
  AIR4THAI_ATTRIBUTION,
  BMKG_ATTRIBUTION,
  CHIP_SCALE,
  COUNTRIES,
  DOE_ATTRIBUTION,
  HANOI_ATTRIBUTION,
  KLH_ATTRIBUTION,
  SCALES,
  SIPONGI_ATTRIBUTION,
  THAI_VERDICTS,
  agMapObservations,
  agWorldObservations,
  air4thaiObservations,
  biasFactor,
  biasFactor24h,
  bmkgObservations,
  bmkgPeriodEnd,
  buildCountrySnapshot,
  classifyIndex,
  classifyPm25,
  countryAt,
  countryVerdict,
  createThAdapter,
  crowdQc,
  doeObservations,
  doeTime,
  epaExtended,
  fromSgSnapshot,
  hanoiObservation,
  hourlyMeans,
  hourAboveDay,
  ispuObservations,
  locate,
  mergeDoeUpdate,
  myApiToPm25,
  officialLine,
  parseAir4ThaiHistory,
  parseAir4ThaiStations,
  parseHanoiSites,
  parseLenientJson,
  parseNuxtRows,
  provinceOffset,
  proxiedAdapter,
  ProxyError,
  sgAdapter,
  sgObservations,
  sipongiHotspots,
  thaiSecondLine,
  thaiVerdict,
  whoMultiple,
  type CountryCode,
  type FetchLike,
  type Observation,
  type ObservationSet,
} from "../src/countries/index";
import bundle from "../fixtures/snapshot-2026-09-28T16.json";

const FX = new URL("../fixtures/sea/", import.meta.url).pathname;
const json = (f: string) => JSON.parse(readFileSync(FX + f, "utf8"));
const text = (f: string) => readFileSync(FX + f, "utf8");
const NOW = Date.parse("2026-09-28T10:30:00Z"); // 17:30 ICT/WIB, 18:30 MYT/SGT

const TH_AQI = json("th-air4thai-aqi-2026-09-28T17ICT.json");
const TH_HIST = json("th-air4thai-history-2026-09-28T17ICT.json");
const AG_MAP = json("ag-map-sea-2026-09-28T1027Z.json");

const set = (country: CountryCode, observations: Observation[], attribution = [AG_ATTRIBUTION], extra: Partial<ObservationSet> = {}): ObservationSet => ({
  country,
  adapters: [],
  fetchedAt: new Date(NOW).toISOString(),
  observations,
  attribution,
  ...extra,
});

const thObs = () => air4thaiObservations(parseAir4ThaiStations(TH_AQI), parseAir4ThaiHistory(TH_HIST));
const thSet = () => set("TH", thObs(), [AIR4THAI_ATTRIBUTION]);

/* ================================================================== scales */

describe("band-scale registry (REGIONAL §3.3, option E)", () => {
  test("every chip scale: contiguous, levels monotonic, every band has a level", () => {
    for (const s of Object.values(SCALES).filter((x) => x.role === "chip")) {
      let prevLevel = -1;
      for (const [i, b] of s.bands.entries()) {
        expect(b.level).not.toBeNull();
        expect(b.level!).toBeGreaterThanOrEqual(prevLevel);
        prevLevel = b.level!;
        if (i > 0 && b.pm25 && s.bands[i - 1].pm25) expect(b.pm25[0]).toBeGreaterThan(s.bands[i - 1].pm25![1]);
        if (i > 0 && b.index && s.bands[i - 1].index) expect(b.index[0]).toBe(s.bands[i - 1].index![1] + 1);
      }
      expect(s.bands[0].level).toBe(0);
    }
  });
  test("chip scale per jurisdiction; LA/KH/MM/TL have none", () => {
    expect(CHIP_SCALE).toMatchObject({ SG: "sg_nea_1h", TH: "th_aqi", MY: "my_api", ID: "id_ispu", VN: "vn_aqi", PH: "ph_dao_2020_14", LA: null, KH: null, MM: null, TL: null });
  });
  test.each([
    ["sg_nea_1h", 55, "normal", 0],
    ["sg_nea_1h", 55.4, "normal", 0],
    ["sg_nea_1h", 56, "elevated", 1],
    ["sg_nea_1h", 251, "very_high", 3],
    ["id_ispu", 55.4, "sedang", 0],
    ["id_ispu", 55.5, "tidak_sehat", 1],
    ["id_ispu", 150.5, "sangat_tidak_sehat", 2],
    ["th_aqi", 15.0, "very_good", 0],
    ["th_aqi", 15.1, "good", 0],
    ["th_aqi", 37.5, "moderate", 1],
    ["th_aqi", 37.6, "starting_to_affect", 2],
    ["th_aqi", 75.1, "affects_health", 3],
    ["ph_dao_2020_14", 35, "fair", 0],
    ["ph_dao_2020_14", 35.1, "usg", 1],
    ["ph_dao_2020_14", 90.5, "emergency", 3],
  ] as const)("classifyPm25(%s, %p) → %s (level %p)", (scale, v, key, level) => {
    const b = classifyPm25(scale, v)!;
    expect(b.key).toBe(key);
    expect(b.level).toBe(level);
  });
  test.each([
    ["th_aqi", 25, "very_good"],
    ["th_aqi", 26, "good"],
    ["th_aqi", 101, "starting_to_affect"],
    ["th_aqi", 201, "affects_health"],
    ["my_api", 100, "moderate"],
    ["my_api", 101, "unhealthy"],
    ["my_api", 158, "unhealthy"],
    ["my_api", 501, "emergency"],
    ["id_ispu", 142, "tidak_sehat"],
    ["vn_aqi", 150, "kem"],
    ["vn_aqi", 151, "xau"],
    ["sg_psi", 81, "moderate"],
  ] as const)("classifyIndex(%s, %p) → %s", (scale, v, key) => {
    expect(classifyIndex(scale, v)!.key).toBe(key);
  });
  test("MY: API → implied 24-h PM2.5 reproduces malaysia.md's cross-check", () => {
    expect(myApiToPm25(95)).toBe(46.5);
    expect(myApiToPm25(96)).toBe(47.3);
    expect(myApiToPm25(71)).toBe(27.7);
    expect(myApiToPm25(84)).toBe(37.9);
    expect(myApiToPm25(-1)).toBeNull();
  });
  test("WHO multiple is the only cross-border reference", () => {
    expect(whoMultiple(45)).toBe(3);
    expect(whoMultiple(null)).toBeNull();
  });
});

/* ================================================================== crowd correction */

describe("crowd correction (ARCHITECTURE_V2 §3, §8 test vectors)", () => {
  test("EPA-extended", () => {
    expect(epaExtended(140, 58)).toBeCloseTo(110.8, 1);
    expect(epaExtended(25, 80)).toBeCloseTo(11.95, 2);
    expect(epaExtended(300, 70)).toBeCloseTo(289.5, 0);
    expect(epaExtended(0, 91)).toBe(0);
  });
  test("bias k: NEA [100,110,90] vs sensor [80,88,72] → 1.25; sensor 120 → nowcast 150", () => {
    const pairs = [100, 110, 90].map((a, i) => ({ anchor: a, sensor: [80, 88, 72][i] }));
    const r = biasFactor(pairs, 3);
    expect(r.k).toBe(1.25);
    expect(r.k! * 120).toBe(150);
    expect(biasFactor(pairs).qc).toBe("uncalibrated"); // needs ≥ 6 pairs by default
    expect(biasFactor(Array.from({ length: 8 }, () => ({ anchor: 100, sensor: 30 }))).qc).toBe("erratic"); // k 3.3
  });
  test("bias k vs a 24-h anchor (MY): JB Eco Botanic 44.2 vs DOE 47.3", () => {
    const r = biasFactor24h(47.3, Array.from({ length: 24 }, () => 44.2));
    expect(r.k).toBeCloseTo(1.07, 2);
    expect(biasFactor24h(47.3, [44, 45]).qc).toBe("uncalibrated");
  });
  test("QC: indoor, stale, zero with busy neighbours, > 3× neighbour median", () => {
    const base = { country: "PH" as const, grade: "lowcost" as const, attributionId: "x", periodEnd: new Date(NOW - 60_000).toISOString() };
    const obs: Observation[] = [
      { ...base, stationId: "a", name: "a", lat: 14.6, lon: 121.0, pm25_now: 20 },
      { ...base, stationId: "b", name: "b", lat: 14.61, lon: 121.0, pm25_now: 22 },
      { ...base, stationId: "c", name: "c", lat: 14.62, lon: 121.0, pm25_now: 24 },
      { ...base, stationId: "zero", name: "z", lat: 14.6, lon: 121.01, pm25_now: 0 },
      { ...base, stationId: "spike", name: "s", lat: 14.6, lon: 121.02, pm25_now: 200 },
      { ...base, stationId: "in", name: "Tower (Indoor)", lat: 14.6, lon: 121.0, pm25_now: 8, indoor: true },
      { ...base, stationId: "old", name: "old", lat: 14.6, lon: 121.0, pm25_now: 20, periodEnd: new Date(NOW - 20 * 60_000).toISOString() },
    ];
    const q = Object.fromEntries(crowdQc(obs, NOW).map((o) => [o.stationId, o.qc]));
    expect(q).toMatchObject({ zero: "outlier", spike: "outlier", in: "indoor", old: "stale" });
    expect(q.a).toBeUndefined();
  });
});

/* ================================================================== borders + locate */

describe("jurisdiction lookup (never across a border)", () => {
  test.each([
    [1.436, 103.786, "SG"], // Woodlands
    [1.4655, 103.7578, "MY"], // Johor Bahru
    [1.2494, 103.8303, "SG"], // Sentosa
    [1.13, 104.05, "ID"], // Batam
    [17.88, 102.74, "TH"], // Nong Khai
    [17.97, 102.63, "LA"], // Vientiane
    [20.43, 99.88, "TH"], // Mae Sai
    [20.45, 99.88, "MM"], // Tachileik
    [4.89, 114.94, "BN"],
    [-8.56, 125.57, "TL"],
    [10.3157, 123.8854, "PH"], // Cebu (coastal)
    [5, 90, null], // Bay of Bengal
    [35.68, 139.69, null], // Tokyo
  ] as const)("countryAt(%p, %p) → %p", (lat, lon, cc) => {
    expect(countryAt(lat, lon)).toBe(cc);
  });
  test("every official station in the live fixtures lies in its own jurisdiction", () => {
    const official = [
      ...thObs(),
      ...doeObservations(json("my-doe-apims-2026-09-28T18MYT.json")),
      ...ispuObservations(json("id-klh-ispu-2026-09-28T17WIB.json"), NOW),
      ...bmkgObservations(text("id-bmkg-pm25-2026-09-28T17WIB.html"), NOW),
    ];
    const wrong = official.filter((o) => countryAt(o.lat, o.lon) !== o.country).map((o) => o.name);
    // Chalermprakiet Hospital (Nan) hugs the Lao border; Natural Earth itself puts it in LA (known limitation).
    expect(wrong.filter((n) => !/Chalermprakiet/.test(n))).toEqual([]);
  });
  test("Johor Bahru: DOE stations only, even with NEA stations in the input", () => {
    const sg = sgObservations({
      v1Pm25: [],
      v1Psi: [],
      pm25Latest: (bundle.responses as Record<string, ApiResponse>)["https://api-open.data.gov.sg/v2/real-time/api/pm25"],
      pm25Days: [],
      psi: null,
      psiDays: [],
    });
    const my = doeObservations(json("my-doe-apims-2026-09-28T18MYT.json"));
    const sets = [set("SG", sg), set("MY", my)];
    const jb = locate(1.4655, 103.7578, sets);
    expect(jb.country).toBe("MY");
    expect(jb.status).toBe("needs_proxy");
    expect(jb.nearest.every((n) => n.observation.country === "MY")).toBe(true);
    expect(jb.nearest[0].observation.name).toMatch(/Larkin/);
    const woodlands = locate(1.436, 103.786, sets);
    expect(woodlands.country).toBe("SG");
    expect(woodlands.nearest.every((n) => n.observation.country === "SG")).toBe(true);
    expect(woodlands.nearestAcrossBorder).toBeNull(); // NEA north (~4 km) is closer than DOE Larkin (~7 km)
    // A JB user 3 km from Larkin still gets DOE even if an NEA station were nearer: the border decides, not distance.
    const causewayJb = locate(1.462, 103.768, sets);
    expect(causewayJb.country).toBe("MY");
    expect(causewayJb.nearest[0].observation.country).toBe("MY");
    expect(locate(5, 90).status).toBe("outside");
  });
  test("builder drops observations from another country", () => {
    const sg = { stationId: "sg.nea:north", name: "north", country: "SG" as const, lat: 1.418, lon: 103.82, grade: "reference" as const, pm25_1h: 200, periodEnd: "2026-09-28T18:00:00+08:00", attributionId: "sg.nea" };
    const my = doeObservations(json("my-doe-apims-2026-09-28T18MYT.json"));
    const s = buildCountrySnapshot(set("MY", [...my, sg], [DOE_ATTRIBUTION]), { lat: 1.4655, lon: 103.7578 }, NOW);
    expect(s.pm25).toBeNull(); // no official 1-hr in MY; NEA's 200 is never borrowed
    expect(s.notes).toContain("other_country_dropped");
    expect(s.stations.every((x) => x.stationId.startsWith("my.doe:"))).toBe(true);
  });
});

/* ================================================================== SG: no behaviour change */

describe("SG adapter (refactor behind the interface, no behaviour change)", () => {
  const BASE = "https://api-open.data.gov.sg/v2/real-time/api/";
  const R = bundle.responses as unknown as Record<string, ApiResponse>;
  const NOW_SG = Date.parse("2026-09-28T16:35:00+08:00");
  const inputs = () => ({
    pm25Latest: R[BASE + "pm25"],
    pm25Days: [R[BASE + "pm25?date=2026-09-28"], R[BASE + "pm25?date=2026-09-27"]],
    psi: R[BASE + "psi"],
    psiDays: [R[BASE + "psi?date=2026-09-28"], R[BASE + "psi?date=2026-09-27"]],
  });
  beforeEach(() => clearCache());

  test("fromSgSnapshot keeps every SPEC §7 field identical and only adds v2.0 fields", () => {
    for (const q of [{ region: "west" }, { lat: 1.33, lon: 103.74 }, { region: "island" }]) {
      const s = buildSnapshot(inputs(), q, NOW_SG);
      const c = fromSgSnapshot(s);
      for (const k of Object.keys(s) as (keyof typeof s)[]) expect(c[k]).toEqual(s[k] as never);
      expect(c.country).toBe("SG");
      expect(c.localBand!.labelEn).toBe({ normal: "Normal", elevated: "Elevated", high: "High", very_high: "Very High" }[s.band]);
      expect(c.level).toBe({ normal: 0, elevated: 1, high: 2, very_high: 3 }[s.band]);
    }
    const w = fromSgSnapshot(buildSnapshot(inputs(), { region: "west" }, NOW_SG));
    expect([w.pm25, w.band, w.instantPsi, w.officialPsi24h]).toEqual([117, "elevated", 165, 81]);
    expect(w.official).toMatchObject({ name: "24-hr PSI", value: 81, category: "Moderate", agency: "NEA" });
    expect(countryVerdict(w).headline).toBe("OK to be out. Go easy on hard exercise.");
  });
  test("sgAdapter.getSnapshot === getSnapshot for the same fetch", async () => {
    const f: V1FetchLike = async (url) => {
      const body = R[url];
      if (!body) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
    };
    const a = await getSnapshot({ region: "south", fetch: f, now: NOW_SG, v2: "always", retryDelayMs: 0 });
    clearCache();
    const b = await sgAdapter.getSnapshot({ station: "sg.nea:south" }, { fetch: f as FetchLike, now: NOW_SG });
    const { country, status, level, localBand, bandBasis, official, pm25Kind, pm25_24h, nearest, stations, range, whoMultiple: w, hotspots, attribution, notes, ...spec } = b;
    expect(spec).toEqual(a as never);
    expect(ADAPTERS.SG).toBe(sgAdapter);
  });
});

/* ================================================================== Thailand (direct) */

describe("Thailand: PCD Air4Thai (direct, CORS *)", () => {
  test("AQILast.PM25.value is the 24-hr mean, not the 1-hr value (thailand.md), reproduced from the live fixture", () => {
    const stations = parseAir4ThaiStations(TH_AQI);
    const hist = parseAir4ThaiHistory(TH_HIST);
    let checked = 0;
    let differs = 0;
    let exact = 0;
    for (const s of stations) {
      const rows = hist[s.stationID];
      const v = Number(s.AQILast?.PM25?.value);
      if (!rows || !(v > 0)) continue;
      const end = Date.parse(`${s.AQILast!.date}T${s.AQILast!.time}:00+07:00`);
      const win = rows.filter((r) => Date.parse(r.time) <= end && Date.parse(r.time) > end - 24 * 3600_000 && r.pm25 !== null);
      if (win.length < 24) continue;
      const mean = win.reduce((a, r) => a + r.pm25!, 0) / win.length;
      // 42/45 match to PCD's 1-dp rounding; 3 differ by ≤ 0.4 (hours back-filled after AQILast was computed).
      expect(Math.abs(mean - v)).toBeLessThanOrEqual(0.5);
      if (Math.abs(mean - v) <= 0.06) exact++;
      const lastHour = win[win.length - 1].pm25!;
      if (Math.abs(lastHour - v) > 0.5) differs++;
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(10);
    expect(exact / checked).toBeGreaterThan(0.85);
    expect(differs / checked).toBeGreaterThan(0.5); // the latest 1-hr value is a different number
  });
  test("parse: 173 stations, hour-ending ICT labels, strings → numbers, sentinels → null", () => {
    const obs = thObs();
    expect(obs.length).toBe(173);
    const cm = obs.find((o) => o.stationId === "th.pcd:35t")!;
    expect(cm.periodEnd).toBe("2026-09-28T17:00:00+07:00");
    expect(cm.official).toMatchObject({ name: "Thai AQI", averaging: "24h", agency: "PCD" });
    expect(cm.history!.length).toBe(26); // 48 h fetched, rolling mean computed, last 26 h kept
    expect(cm.pm25_1h).not.toBe(cm.pm25_24h);
    expect(obs.filter((o) => o.pm25_1h === undefined || o.pm25_1h === null).length).toBeGreaterThan(100); // no history fetched for them
  });
  test("Bangkok snapshot: 1-hr big number, chip from the official 24-hr Thai AQI", () => {
    const s = buildCountrySnapshot(thSet(), { lat: 13.7563, lon: 100.5018 }, NOW);
    expect(s.country).toBe("TH");
    expect(s.status).toBe("live_direct");
    expect(s.pm25Kind).toBe("official_1h");
    expect(s.pm25).toBe(14);
    expect(s.bandBasis).toBe("official_index");
    expect(s.localBand).toMatchObject({ scaleId: "th_aqi", key: "very_good", labelLocal: "ดีมาก", labelEn: "Excellent" });
    expect(s.official).toMatchObject({ name: "Thai AQI", value: 19 });
    expect(s.observedAt).toBe("2026-09-28T17:00:00+07:00");
    expect(s.history).toHaveLength(24);
    expect(s.history.at(-1)!.pm25Avg24h).toBe(11.5);
    expect(s.history.every((h) => h.time.endsWith("+07:00"))).toBe(true);
    expect(s.attribution).toEqual([AIR4THAI_ATTRIBUTION]);
    expect(s.stale).toBe(false);
    expect(s.instantPsi).toBeUndefined();
  });
  test("the 1-hr number is never banded with the 24-hr breakpoints", () => {
    const base = { country: "TH" as const, grade: "reference" as const, attributionId: "th.pcd", lat: 18.79, lon: 98.99, periodEnd: "2026-09-28T17:00:00+07:00" };
    const o: Observation = { ...base, stationId: "th.pcd:x", name: "x", pm25_1h: 80, pm25_24h: 20,
      official: { scaleId: "th_aqi", name: "Thai AQI", value: 33, category: "ดี", averaging: "24h", param: "PM25", agency: "PCD" } };
    const s = buildCountrySnapshot(set("TH", [o], [AIR4THAI_ATTRIBUTION]), { lat: 18.79, lon: 98.99 }, NOW);
    expect(s.pm25).toBe(80); // would be "affects health" if banded by concentration
    expect(s.localBand!.key).toBe("good");
    expect(s.level).toBe(0);
    const v = countryVerdict(s, ["general"]);
    expect(v.headline).toBe("Fine to be out.");
    expect(v.secondLine).toBe("The last hour is higher than the 24-hour average. Check again in an hour.");
    expect(v.secondLineLocal).toBe("ค่าชั่วโมงล่าสุดสูงกว่าค่าเฉลี่ย 24 ชั่วโมง ตรวจสอบอีกครั้งในอีกหนึ่งชั่วโมง");
    expect(officialLine(s)).toBe("PCD Thai AQI (24-hr): 33 · ดี (Satisfactory)");
  });
  test("Thai verdict copy: COPY.md tone rules, short ≤ 28 chars, strictness never falls as bands rise", () => {
    const banned = /\b(today|danger|dangerous|toxic|deadly|hazardous|alarming)\b|!/i;
    const keys = ["very_good", "good", "moderate", "starting_to_affect", "affects_health"];
    expect(Object.keys(THAI_VERDICTS)).toEqual(keys);
    for (const g of ["general", "kids", "sensitive", "exercising", "outdoor_worker"] as const) {
      let prev = -1;
      for (const k of keys) {
        const c = THAI_VERDICTS[k][g];
        expect(c.en).not.toMatch(banned);
        expect(c.short.length).toBeLessThanOrEqual(28);
        expect(c.short).not.toMatch(/\.$/);
        expect(c.th.length).toBeGreaterThan(0);
        expect(c.strict).toBeGreaterThanOrEqual(prev);
        prev = c.strict;
      }
    }
  });
  test("mixed profile → strictest Thai row; kids never told to wear N95 (actions via shared band)", () => {
    const mk = (key: string) => {
      const s = buildCountrySnapshot(thSet(), { lat: 13.7563, lon: 100.5018 }, NOW);
      const b = SCALES.th_aqi.bands.find((x) => x.key === key)!;
      return { ...s, localBand: { ...s.localBand!, key, level: b.level! }, level: b.level!, band: (["normal", "elevated", "high", "very_high"] as const)[b.level!] };
    };
    const v = thaiVerdict(mk("starting_to_affect"), ["general", "kids"])!;
    expect(v.headline).toBe("Indoor play for now. Keep trips out short.");
    expect(v.headlineLocal).toBe("ช่วงนี้ให้เด็กเล่นในบ้าน ออกไปข้างนอกให้สั้นที่สุด");
    expect(thaiVerdict(mk("affects_health"), ["heart_lung", "exercising"])!.headline).toBe("Stay indoors for now. Keep your medicine close.");
    expect(thaiVerdict(mk("moderate"), ["general"])!.short).toBe("Go easy outdoors");
  });
  test("Thai second line: stale first, then rising fast, then hour-above-day, then easing", () => {
    const base = { stale: false, observedAt: "2026-09-28T16:00:00+07:00", trend: { delta: 0, direction: "steady" as const }, level: 1 as const, pm25: 30, pm25_24h: 28 };
    expect(thaiSecondLine({ ...base, stale: true })!.en).toBe("Reading is from 4pm. It may not match the air now.");
    expect(thaiSecondLine({ ...base, trend: { delta: 25, direction: "up" } })!.en).toBe("Getting worse. Check again in an hour.");
    expect(thaiSecondLine({ ...base, pm25: 60, pm25_24h: 30 })!.en).toMatch(/higher than the 24-hour average/);
    expect(thaiSecondLine({ ...base, trend: { delta: -22, direction: "down" } })!.en).toBe("Getting better. Check again in an hour.");
    expect(thaiSecondLine(base)).toBeNull();
    expect(hourAboveDay(20, 12)).toBe(false); // 1.5× but < +15
  });
  test("direct adapter: 2 calls, history only for the 6 nearest stations, ICT dates", async () => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      const body = url.includes("getAQI_JSON") ? TH_AQI : url.includes("getHistoryData") ? TH_HIST : null;
      return body ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) } : { ok: false, status: 404, json: async () => ({}) };
    };
    const s = await createThAdapter().getSnapshot({ lat: 18.7883, lon: 98.9853 }, { fetch: f, now: NOW });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe("https://air4thai.pcd.go.th/forweb/getAQI_JSON.php");
    const u = new URL(calls[1]);
    expect(u.searchParams.get("stationID")!.split(",")).toHaveLength(6);
    expect(u.searchParams.get("stationID")).toContain("35t");
    expect([u.searchParams.get("sdate"), u.searchParams.get("edate"), u.searchParams.get("type")]).toEqual(["2026-09-27", "2026-09-28", "hr"]);
    expect(s.nearest!.name).toBe("Yupparaj Wittayalai School");
    expect(s.pm25Kind).toBe("official_1h");
  });
  test("history endpoint down → still a snapshot: official index + band, no 1-hr number", async () => {
    const f: FetchLike = async (url) =>
      url.includes("getAQI_JSON") ? { ok: true, status: 200, json: async () => TH_AQI } : { ok: false, status: 502, json: async () => ({}) };
    const set0 = await createThAdapter().fetchObservations({ fetch: f, now: NOW, near: { lat: 13.75, lon: 100.5 } });
    expect(set0.warnings![0]).toMatch(/502/);
    const s = buildCountrySnapshot(set0, { lat: 13.7563, lon: 100.5018 }, NOW);
    expect(s.pm25).toBeNull();
    expect(s.localBand!.scaleId).toBe("th_aqi");
    expect(s.notes).toContain("no_official_1h");
  });
});

/* ================================================================== Malaysia (proxy) */

describe("Malaysia: DOE APIMS (+ AirGradient)", () => {
  const MY = json("my-doe-apims-2026-09-28T18MYT.json");
  test("parse: 68 stations, fake-UTC epoch relabelled +08:00, API inverted to 24-h PM2.5", () => {
    const obs = doeObservations(MY);
    expect(obs).toHaveLength(68);
    expect(doeTime(1790618400000)).toBe("2026-09-28T18:00:00+08:00");
    const larkin = obs.find((o) => o.stationId === "my.doe:CA33J")!;
    expect(larkin.pm25_1h).toBeNull(); // Malaysia publishes no 1-hr PM2.5
    expect(larkin.official).toMatchObject({ name: "API", averaging: "24h", param: "PM2.5", agency: "DOE Malaysia" });
    expect(larkin.pm25_24h).toBe(myApiToPm25(larkin.official!.value));
  });
  test("mid-update nulls keep the previous hour; offline after 2 h 15 min", () => {
    const prev = doeObservations(MY);
    const next = prev.slice(0, 40);
    expect(mergeDoeUpdate(prev, next, NOW)).toHaveLength(68);
    expect(mergeDoeUpdate(prev, next, NOW + 3 * 3600_000)).toHaveLength(40);
  });
  test("KL: crowd estimate as the number, DOE API as the band, 'higher than 24-hour' line", () => {
    const ag = agMapObservations(AG_MAP, ["MY"]);
    const s = buildCountrySnapshot(set("MY", [...doeObservations(MY), ...ag], [DOE_ATTRIBUTION, AG_ATTRIBUTION]), { lat: 3.139, lon: 101.6869 }, NOW);
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.pm25).toBeGreaterThan(50);
    expect(s.range).not.toBeNull();
    expect(s.range![0]).toBeLessThanOrEqual(s.pm25!);
    expect(s.range![1]).toBeGreaterThanOrEqual(s.pm25!);
    expect(s.bandBasis).toBe("official_index");
    expect(s.localBand).toMatchObject({ scaleId: "my_api", labelLocal: "Sederhana" });
    expect(countryVerdict(s).secondLine).toBe("Nearby sensors read higher than the 24-hour average. Check again in an hour.");
    expect(s.attribution.map((a) => a.id).sort()).toEqual(["crowd.airgradient", "my.doe"]);
  });
  test("Kuching: no sensors → no number, DOE band, honest note", () => {
    const s = buildCountrySnapshot(set("MY", doeObservations(MY), [DOE_ATTRIBUTION]), { lat: 1.5535, lon: 110.3593 }, NOW);
    expect(s.pm25).toBeNull();
    expect(s.official!.value).toBe(96);
    expect(s.nearest!.name).toMatch(/Kuching/);
    expect(s.notes).toContain("no_official_1h");
  });
});

/* ================================================================== Indonesia (proxy) */

describe("Indonesia: BMKG 1-hr + KLH ISPU + SiPongi", () => {
  const HTML = text("id-bmkg-pm25-2026-09-28T17WIB.html");
  const ISPU = json("id-klh-ispu-2026-09-28T17WIB.json");
  const idSet = () =>
    set("ID", [...bmkgObservations(HTML, NOW), ...ispuObservations(ISPU, NOW), ...agMapObservations(AG_MAP, ["ID"])], [BMKG_ATTRIBUTION, KLH_ATTRIBUTION, AG_ATTRIBUTION, SIPONGI_ATTRIBUTION], {
      hotspots: sipongiHotspots(json("id-sipongi-hotspots-2026-09-28.json")),
      hotspotSource: "SiPongi",
    });
  test("BMKG Nuxt payload: 25 stations, JAM 16 → hour ending 17:00 WIB", () => {
    const rows = parseNuxtRows(HTML);
    expect(rows).toHaveLength(25);
    expect(rows.find((r) => r.LOKASI === "Palangkaraya")).toMatchObject({ JAM: 16, PM25: 165.9, KONDISI: "Sangat Tidak Sehat" });
    const obs = bmkgObservations(HTML, NOW);
    expect(obs.every((o) => o.periodEnd === "2026-09-28T17:00:00+07:00")).toBe(true);
    // BMKG's own KONDISI = ISPU category of the 1-hr value: our classification agrees on every row.
    for (const r of rows) expect(classifyPm25("id_ispu", r.PM25!)!.labelLocal).toBe(r.KONDISI!);
    expect(parseNuxtRows("<html>no payload</html>")).toEqual([]);
  });
  test("BMKG hour rolls back a day just after midnight", () => {
    expect(bmkgPeriodEnd(23, Date.parse("2026-09-29T00:20:00+07:00"))).toBe("2026-09-29T00:00:00+07:00");
    expect(bmkgPeriodEnd(16, NOW)).toBe("2026-09-28T17:00:00+07:00");
    expect(bmkgPeriodEnd(24, NOW)).toBeNull();
  });
  test("ISPU: province zones, a_pm25 '0' = missing, future stamps dropped", () => {
    expect(provinceOffset("Kalimantan Timur", "WIB")).toBe(8);
    expect(provinceOffset("Papua Barat")).toBe(9);
    expect(provinceOffset("Riau")).toBe(7);
    const obs = ispuObservations(ISPU, NOW);
    expect(obs.length).toBeGreaterThan(100);
    const plb = obs.find((o) => o.stationId === "id.klh:PALEMBANG")!;
    expect(plb.official).toMatchObject({ name: "ISPU", param: "PM2.5", averaging: "24h" });
    expect(obs.find((o) => o.stationId === "id.klh:DKI1")?.pm25_24h ?? null).toBeNull();
    expect(obs.every((o) => Date.parse(o.periodEnd) <= NOW + 600_000)).toBe(true);
  });
  test("Palembang: BMKG 1-hr, ISPU category on the 1-hr value (BMKG practice), official ISPU row", () => {
    const s = buildCountrySnapshot(idSet(), { lat: -2.9761, lon: 104.7754 }, NOW);
    expect(s.pm25Kind).toBe("official_1h");
    expect(s.nearest!.name).toBe("Musi 2 Palembang");
    expect(s.bandBasis).toBe("pm25_1h");
    expect(s.localBand!.labelLocal).toBe(classifyPm25("id_ispu", s.pm25!)!.labelLocal);
    expect(s.official).toMatchObject({ name: "ISPU", value: 142 });
    expect(s.hotspots).toMatchObject({ radiusKm: 100, source: "SiPongi" });
  });
  test("Palangka Raya: High (Sangat Tidak Sehat) now while the 24-hr ISPU says Tidak Sehat", () => {
    const s = buildCountrySnapshot(idSet(), { lat: -2.2161, lon: 113.9135 }, NOW);
    expect(s.pm25).toBe(166);
    expect(s.band).toBe("high");
    expect(s.localBand!.labelLocal).toBe("Sangat Tidak Sehat");
    expect(s.official!.category).toBe("Tidak Sehat");
    expect(countryVerdict(s, ["general"]).headline).toBe("Short trips out are OK. Exercise indoors.");
  });
  test("Denpasar: no BMKG within 25 km → crowd estimate; Surabaya: ISPU only", () => {
    const d = buildCountrySnapshot(idSet(), { lat: -8.6705, lon: 115.2126 }, NOW);
    expect(d.pm25Kind).toBe("crowd_estimate");
    expect(d.range).not.toBeNull();
    const sby = buildCountrySnapshot(idSet(), { lat: -7.2575, lon: 112.7521 }, NOW);
    expect(sby.pm25).toBeNull();
    expect(sby.bandBasis).toBe("official_index");
    expect(sby.official!.name).toBe("ISPU");
  });
});

/* ================================================================== Vietnam (proxy) */

describe("Vietnam: Hanoi moitruongthudo", () => {
  const sites = parseHanoiSites(json("vn-hanoi-site-2026-09-28.json"));
  const obsFor = (id: number) =>
    hanoiObservation(sites.find((s) => s.id === id)!, json(`vn-hanoi-dailystat-${id}-2026-09-28T17ICT.json`), json(`vn-hanoi-dailyaqi-${id}-2026-09-28T17ICT.json`), NOW)!;
  test("hourly mean of 5-min samples, (H−60, H], ≥ 9 of 12", () => {
    const s = (t: string, v: string | null) => ({ time: t, value: v });
    const five = Array.from({ length: 12 }, (_, i) => s(`2026-09-28 16:${String(5 + i * 5).padStart(2, "0")}`.replace("16:60", "17:00"), "10"));
    expect(hourlyMeans(five)).toEqual([{ time: "2026-09-28T17:00:00+07:00", pm25: 10 }]);
    expect(hourlyMeans(five.map((x, i) => (i < 4 ? { ...x, value: null } : x)))[0].pm25).toBeNull();
  });
  test("station 48 is live (17:00), official hourly VN_AQI is the max over pollutants", () => {
    const o = obsFor(48);
    expect(sites).toHaveLength(4);
    expect(o.periodEnd).toBe("2026-09-28T17:00:00+07:00");
    expect(o.pm25_1h).toBe(11);
    expect(o.official).toMatchObject({ name: "VN_AQI", value: 34, category: "Tốt", averaging: "nowcast" });
  });
  test("HCMC: crowd number but no official station → no band, 'No official reading near here.'", () => {
    const ag = crowdQc(agMapObservations(AG_MAP, ["VN"]), NOW);
    const s = buildCountrySnapshot(set("VN", [obsFor(48), ...ag]), { lat: 10.8231, lon: 106.6297 }, NOW);
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.band).toBeNull();
    expect(countryVerdict(s).headline).toBe("No official reading near here.");
  });
  test("Hanoi snapshot: chip from the published VN_AQI", () => {
    const s = buildCountrySnapshot(set("VN", [obsFor(48), obsFor(49)], [HANOI_ATTRIBUTION]), { lat: 21.0285, lon: 105.8542 }, NOW);
    expect(s.pm25).toBe(11);
    expect(s.bandBasis).toBe("official_index");
    expect(s.localBand).toMatchObject({ scaleId: "vn_aqi", labelLocal: "Tốt" });
    expect(s.history.length).toBeGreaterThanOrEqual(20);
  });
});

/* ================================================================== crowd countries (PH, LA) */

describe("AirGradient crowd (PH, LA)", () => {
  test("map API: AirGradient only (no OpenAQ duplicates of Air4Thai, no Sensor.Community), country by polygon", () => {
    const all = agMapObservations(AG_MAP);
    expect(all.every((o) => o.stationId.startsWith("ag:"))).toBe(true);
    const n = (cc: string) => all.filter((o) => o.country === cc).length;
    expect(n("LA")).toBeGreaterThan(100);
    expect(n("PH")).toBeGreaterThan(15);
    expect(n("TH")).toBeGreaterThan(150);
    expect(all.some((o) => o.indoor)).toBe(true);
  });
  test("world API fallback: lenient JSON, EPA-extended, I- models flagged indoor", () => {
    const raw = readFileSync(FX + "ag-world-sea-excerpt-2026-09-28T1034Z.json", "utf8");
    const broken = raw.replace('"locationName":"', '"locationName":"\u0001').slice(0, -40); // control char + truncated tail
    const parsed = parseLenientJson(broken) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    const obs = agWorldObservations(JSON.parse(raw));
    expect(obs.filter((o) => o.indoor).length).toBe(8);
    expect(obs.every((o) => o.corrected === "epa_ext")).toBe(true);
  });
  test("Metro Manila: crowd estimate on DENR DAO 2020-14 categories", () => {
    const ag = crowdQc(agMapObservations(AG_MAP, ["PH"]), NOW);
    const s = buildCountrySnapshot(set("PH", ag), { lat: 14.6354, lon: 121.0779 }, NOW);
    expect(s.pm25Kind).toBe("crowd_estimate");
    expect(s.localBand!.scaleId).toBe("ph_dao_2020_14");
    expect(s.official).toBeNull();
    expect(s.attribution).toEqual([AG_ATTRIBUTION]);
  });
  test("Vientiane: no national scale → no chip, no level, WHO line instead of a verdict", () => {
    const ag = crowdQc(agMapObservations(AG_MAP, ["LA"]), NOW);
    const s = buildCountrySnapshot(set("LA", ag), { lat: 17.9757, lon: 102.6331 }, NOW);
    expect(s.pm25).not.toBeNull();
    expect([s.band, s.level, s.localBand, s.bandBasis]).toEqual([null, null, null, "none"]);
    const v = countryVerdict(s);
    expect(v.headline).toBe("There's no official air-quality scale here.");
    expect(v.secondLine).toBe(`${s.whoMultiple}× the WHO daily guideline.`);
  });
});

/* ================================================================== proxied adapters */

describe("proxied adapters (MY, ID, VN, PH, LA)", () => {
  test("call /v1/{cc}/observations with no location, build on the device", async () => {
    const calls: string[] = [];
    const body = set("PH", agMapObservations(AG_MAP, ["PH"]));
    const f: FetchLike = async (url) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
    };
    const s = await proxiedAdapter("PH", { kind: "crowd" }).getSnapshot({ lat: 14.6354, lon: 121.0779 }, { fetch: f, proxyBase: "https://edge.example/", now: NOW });
    expect(calls).toEqual(["https://edge.example/v1/ph/observations"]);
    expect(calls[0]).not.toMatch(/lat|lon/);
    expect(s.country).toBe("PH");
  });
  test("errors: no proxy configured, HTTP error, wrong shape / wrong country", async () => {
    const ok = (b: unknown): FetchLike => async () => ({ ok: true, status: 200, json: async () => b });
    await expect(proxiedAdapter("MY", { kind: "mixed" }).fetchObservations({})).rejects.toBeInstanceOf(ProxyError);
    await expect(proxiedAdapter("MY", { kind: "mixed" }).fetchObservations({ proxyBase: "x", fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }) })).rejects.toThrow(/503/);
    await expect(proxiedAdapter("MY", { kind: "mixed" }).fetchObservations({ proxyBase: "x", fetch: ok({ nope: 1 }) })).rejects.toThrow(/Unexpected/);
    await expect(proxiedAdapter("MY", { kind: "mixed" }).fetchObservations({ proxyBase: "x", fetch: ok(set("ID", [])) })).rejects.toThrow(/Unexpected/);
  });
  test("registry: adapters and statuses agree with COVERAGE.md", () => {
    expect(Object.entries(COUNTRIES).map(([k, v]) => [k, v.status])).toEqual([
      ["SG", "live_direct"], ["TH", "live_direct"], ["MY", "needs_proxy"], ["ID", "needs_proxy"], ["VN", "needs_proxy"],
      ["PH", "needs_proxy"], ["LA", "needs_proxy"], ["KH", "not_feasible"], ["MM", "not_feasible"], ["BN", "not_feasible"], ["TL", "not_feasible"],
    ]);
    for (const [cc, a] of Object.entries(ADAPTERS)) {
      if (!a) continue;
      expect(a.country).toBe(cc as CountryCode);
      expect(a.transport).toBe(cc === "SG" || cc === "TH" ? "direct" : "proxy");
    }
  });
});
