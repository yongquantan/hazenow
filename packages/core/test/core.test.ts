import { beforeEach, describe, expect, test } from "bun:test";
import {
  accessibleLabel,
  actions,
  bandAnchor,
  calmLine,
  chartSummary,
  easingPeak,
  forWhom,
  headlineLabel,
  normaliseProfile,
  officialPsiLabel,
  secondLine,
  trendWord,
  advice,
  badgeSvg,
  bandFor,
  buildSnapshot,
  clearCache,
  compactText,
  formatSgtTime,
  formatWithUncertainty,
  uncertaintyLine,
  getSnapshot,
  haversineKm,
  idw,
  instantPsi,
  islandMean,
  locate,
  mergeHours,
  nextPollDelayMs,
  nextWidgetRefreshAt,
  shouldFetchV2,
  backoffMs,
  fromV1,
  mergeV1V2,
  v2BackoffUntil,
  NoDataError,
  parseHours,
  provenance,
  psiLabel,
  REGION_COORDS,
  refreshStale,
  sgtDate,
  shareText,
  summaryLine,
  trend,
  trendWords,
  typicalMultiple,
  uncertainty,
  verdict,
  type ApiResponse,
  stationRange,
  pickShareCard,
  episodeStats,
  shareCardContent,
  shareCardText,
  shareFileName,
  formatCardWhen,
  nowHeadline,
  sharePlace,
  nearestArea,
  type NowCard,
  type GroupCard,
  type ClocksCard,
  type ClearCard,
  type PreviewCard,
  searchAreas,
  findArea,
  roundCoord,
  SG_AREAS,
  type Scenario,
  scenarioFetch,
  SCENARIOS,
  type FetchLike,
  type Snapshot,
} from "../src/index";
import bundle from "../fixtures/snapshot-2026-09-28T16.json";

const BASE = "https://api-open.data.gov.sg/v2/real-time/api/";
const R = bundle.responses as unknown as Record<string, ApiResponse>;
const NOW = Date.parse("2026-09-28T16:35:00+08:00");

const LATEST = { north: 49, south: 105, west: 117, east: 83, central: 105 };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function pm25Response(values: Record<string, number | null>, time = "2026-09-28T16:00:00+08:00"): ApiResponse {
  const r = clone(R[BASE + "pm25"]);
  r.data!.items![0].readings = { pm25_one_hourly: values };
  r.data!.items![0].timestamp = time;
  return r;
}

const allInputs = () => ({
  pm25Latest: R[BASE + "pm25"],
  pm25Days: [R[BASE + "pm25?date=2026-09-28"], R[BASE + "pm25?date=2026-09-27"]],
  psi: R[BASE + "psi"],
  psiDays: [R[BASE + "psi?date=2026-09-28"], R[BASE + "psi?date=2026-09-27"]],
});

describe("SPEC test vectors", () => {
  test("region=south → 105 / elevated / 153", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "south" }, NOW);
    expect([s.pm25, s.band, s.instantPsi]).toEqual([105, "elevated", 153]);
    expect(s.locationMode).toBe("region");
    expect(s.nearestRegion).toBe("south");
  });
  test("region=west → 117 / elevated / 165", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "west" }, NOW);
    expect([s.pm25, s.band, s.instantPsi]).toEqual([117, "elevated", 165]);
  });
  test("region=north → 49 / normal / 93", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "north" }, NOW);
    expect([s.pm25, s.band, s.instantPsi]).toEqual([49, "normal", 93]);
  });
  test("south = -1 → island mean 88.5 → 89, flagged island", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, south: -1 }) }, { region: "south" }, NOW);
    expect(s.pm25).toBe(89);
    expect(s.locationMode).toBe("island");
    expect(s.regions.south.pm25).toBeNull();
  });
  test("GPS at (1.29587, 103.82) → exactly south", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { lat: 1.29587, lon: 103.82 }, NOW);
    expect(s.pm25).toBe(105);
    expect(s.nearestRegion).toBe("south");
    expect(s.locationMode).toBe("gps");
  });
  test.each([
    [0, 0],
    [12, 50],
    [55, 100],
    [150, 200],
    [250, 300],
    [500, 500],
    [600, 500],
    [105, 153],
    [117, 165],
    [49, 93],
  ])("instantPsi(%d) = %d", (c, i) => expect(instantPsi(c)).toBe(i));
  test("default region is central", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, {}, NOW);
    expect(s.nearestRegion).toBe("central");
    expect(s.pm25).toBe(105);
  });
});

describe("pure math", () => {
  test("band edges", () => {
    expect([0, 55, 56, 150, 151, 250, 251, 999].map(bandFor)).toEqual([
      "normal",
      "normal",
      "elevated",
      "elevated",
      "high",
      "high",
      "very_high",
      "very_high",
    ]);
  });
  test("psiLabel edges", () => {
    expect([0, 50, 51, 100, 101, 200, 201, 300, 301].map(psiLabel)).toEqual([
      "Good",
      "Good",
      "Moderate",
      "Moderate",
      "Unhealthy",
      "Unhealthy",
      "Very Unhealthy",
      "Very Unhealthy",
      "Hazardous",
    ]);
  });
  test("instantPsi clamps negatives and interpolates", () => {
    expect(instantPsi(-5)).toBe(0);
    expect(instantPsi(6)).toBe(25);
    expect(instantPsi(300)).toBe(350);
    expect(instantPsi(425)).toBe(450);
  });
  test("advice per band", () => {
    expect(advice("normal")).toBe("Normal activities.");
    expect(advice(200)).toMatch(/^Reduce outdoor exertion/);
  });
  test("trend thresholds", () => {
    expect(trend(105, 100)).toEqual({ delta: 5, direction: "up" });
    expect(trend(105, 101)).toEqual({ delta: 4, direction: "steady" });
    expect(trend(95, 100)).toEqual({ delta: -5, direction: "down" });
    expect(trend(95, null)).toEqual({ delta: 0, direction: "steady" });
    expect(trend(95, -1)).toEqual({ delta: 0, direction: "steady" });
  });
  test("haversine: west↔east ≈ 26.7 km", () => {
    expect(haversineKm(REGION_COORDS.west, REGION_COORDS.east)).toBeCloseTo(26.71, 1);
  });
  test("IDW excludes -1 / null and weights by 1/d²", () => {
    const r = idw({ ...LATEST, central: -1, east: null }, REGION_COORDS, { lat: 1.35735, lon: 103.82 })!;
    // central is invalid; north is ~6.7 km away, the rest ≥ 6.8 km
    expect(r.nearestRegion).toBe("north");
    expect(r.value).toBeGreaterThan(49);
    expect(r.value).toBeLessThan(117);
    expect(idw({ north: -1 }, REGION_COORDS, REGION_COORDS.north)).toBeNull();
  });
  test("IDW snaps within 0.5 km", () => {
    const r = idw(LATEST, REGION_COORDS, { lat: 1.3585, lon: 103.8205 })!; // ~130 m from central
    expect(r.nearestRegion).toBe("central");
    expect(r.value).toBe(105);
  });
  test("locate: unknown region → island", () => {
    expect(locate(LATEST, REGION_COORDS, { region: "atlantis" }).locationMode).toBe("island");
    expect(locate(LATEST, REGION_COORDS, { region: "WEST" }).value).toBe(117);
  });
  test("islandMean rounds half up and ignores invalid", () => {
    expect(islandMean({ a: 1, b: 2 })).toBe(2);
    expect(islandMean({ a: -1, b: null })).toBeNull();
  });
});

describe("parsing & -1 handling", () => {
  test("-1, null, negatives, strings become null", () => {
    const h = parseHours(pm25Response({ north: -1, south: null, east: -3, west: "x" as unknown as number, central: 0 }), "pm25_one_hourly");
    expect(h[0].values).toEqual({ north: null, south: null, east: null, west: null, central: 0 });
  });
  test("never displays -1: region values null when offline", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, west: -1 }) }, { region: "south" }, NOW);
    expect(s.regions.west.pm25).toBeNull();
    expect(JSON.stringify(s)).not.toContain("-1");
  });
  test("merge: later-published back-fill wins, valid never replaced by invalid", () => {
    const a = { time: "2026-09-28T16:00:00+08:00", published: "2026-09-28T16:30:00+08:00", values: { west: null, east: 80 } };
    const b = { time: "2026-09-28T16:00:00+08:00", published: "2026-09-28T17:10:00+08:00", values: { west: 117, east: null } };
    expect(mergeHours([a], [b])[0].values).toEqual({ west: 117, east: 80 });
  });
  test("region coordinates come from regionMetadata", () => {
    const r = pm25Response(LATEST);
    r.data!.regionMetadata![0].labelLocation = { latitude: 1.45, longitude: 103.8 };
    const s = buildSnapshot({ pm25Latest: r }, { region: "north" }, NOW);
    expect(s.regions.north.lat).toBe(1.45);
  });
});

describe("stale fallback", () => {
  test("all regions -1 in latest hour → walk back, stale", () => {
    const inputs = allInputs();
    inputs.pm25Latest = pm25Response({ north: -1, south: -1, east: -1, west: -1, central: -1 });
    // day data also carries 16:00; blank it so the walk-back is exercised
    const today = clone(inputs.pm25Days[0]);
    today.data!.items![0].readings = { pm25_one_hourly: { north: -1, south: -1, east: -1, west: -1, central: -1 } };
    inputs.pm25Days[0] = today;
    const s = buildSnapshot(inputs, { region: "west" }, NOW);
    expect(s.observedAt).toBe("2026-09-28T15:00:00+08:00");
    expect(s.pm25).toBe(103);
    expect(s.stale).toBe(true);
  });
  test("observedAt older than 2h15m → stale; fresher → not", () => {
    const inputs = { pm25Latest: pm25Response(LATEST) };
    expect(buildSnapshot(inputs, {}, Date.parse("2026-09-28T18:14:00+08:00")).stale).toBe(false);
    expect(buildSnapshot(inputs, {}, Date.parse("2026-09-28T18:16:00+08:00")).stale).toBe(true);
  });
  test("refreshStale re-evaluates a cached snapshot", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, {}, NOW);
    expect(refreshStale(s, Date.parse("2026-09-29T09:00:00+08:00")).stale).toBe(true);
  });
  test("no valid data anywhere → NoDataError", () => {
    expect(() => buildSnapshot({ pm25Latest: pm25Response({ north: -1 }) }, {}, NOW)).toThrow(NoDataError);
    expect(() => buildSnapshot({}, {}, NOW)).toThrow(NoDataError);
  });
});

describe("full snapshot from real fixture", () => {
  const s = buildSnapshot(allInputs(), { region: "west" }, NOW);
  test("headline numbers", () => {
    expect(s.pm25).toBe(117);
    expect(s.instantPsi).toBe(165);
    expect(s.instantPsiLabel).toBe("Unhealthy");
    expect(s.officialPsi24h).toBe(81);
    expect(s.observedAt).toBe("2026-09-28T16:00:00+08:00");
    expect(s.publishedAt).toBe("2026-09-28T16:30:40+08:00");
    expect(s.stale).toBe(false);
    expect(s.source).toBe("NEA via data.gov.sg");
  });
  test("trend vs previous hour (west 103 → 117)", () => {
    expect(s.trend).toEqual({ delta: 14, direction: "up" });
  });
  test("history: 24 points oldest→newest with 24-hr PSI and 24-hr PM2.5 average", () => {
    expect(s.history.length).toBe(24);
    expect(s.history[0].time).toBe("2026-09-27T17:00:00+08:00");
    expect(s.history.at(-1)).toEqual({ time: "2026-09-28T16:00:00+08:00", pm25: 117, psi24h: 81, pm25Avg24h: 38 });
    const times = s.history.map((h) => Date.parse(h.time));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  test("regions carry pm25 + psi24h + coords", () => {
    expect(s.regions.south).toEqual({ pm25: 105, psi24h: 84, lat: 1.29587, lon: 103.82 });
  });
  test("SPEC field names only (plus optional history.psi24h)", () => {
    expect(Object.keys(s).sort()).toEqual(
      [
        "pm25",
        "band",
        "instantPsi",
        "instantPsiLabel",
        "officialPsi24h",
        "trend",
        "history",
        "regions",
        "nearestRegion",
        "locationMode",
        "observedAt",
        "publishedAt",
        "stale",
        "source",
      ].sort(),
    );
  });
});

describe("format", () => {
  test("SGT times", () => {
    expect(formatSgtTime("2026-09-28T16:00:00+08:00")).toBe("4pm");
    expect(formatSgtTime("2026-09-28T16:30:40+08:00")).toBe("4:30pm");
    expect(formatSgtTime("2026-09-28T00:05:00+08:00")).toBe("12:05am");
    expect(sgtDate(Date.parse("2026-09-27T17:00:00Z"))).toBe("2026-09-28");
  });
  test("poll timing (SPEC v1.3)", () => {
    const T = (hms: string) => Date.parse(`2026-09-28T${hms}+08:00`);
    const sec = (hms: string, obs?: string) => nextPollDelayMs(T(hms), obs ? `2026-09-28T${obs}:00+08:00` : null) / 1000;
    // New hour not in yet: wait for hh:00:30, then every 60 s until hh:10.
    expect(sec("17:00:05", "16:00")).toBe(25);
    expect(sec("17:00:30", "16:00")).toBe(60);
    expect(sec("17:09:00", "16:00")).toBe(60);
    // Gave up at hh:10 → next v2 check at hh:35.
    expect(sec("17:10:00", "16:00")).toBe(25 * 60);
    // New hour in → idle until hh:35, then hh:50, then next hh:00:30.
    expect(sec("17:01:10", "17:00")).toBe(33 * 60 + 50);
    expect(sec("17:40:00", "17:00")).toBe(10 * 60);
    expect(sec("17:55:00", "17:00")).toBe(5 * 60 + 30);
    expect(nextWidgetRefreshAt(T("17:01:00"))).toBe(T("17:02:00"));
    expect(nextWidgetRefreshAt(T("17:02:00"))).toBe(T("18:02:00"));
  });
  test("v2 due at :35 / :50, never more than once a minute", () => {
    const T = (hm: string) => Date.parse(`2026-09-28T${hm}:00+08:00`);
    expect(shouldFetchV2(T("17:05"), null)).toBe(true);
    expect(shouldFetchV2(T("17:30"), T("17:05"))).toBe(false);
    expect(shouldFetchV2(T("17:35"), T("17:05"))).toBe(true);
    expect(shouldFetchV2(T("17:49"), T("17:35"))).toBe(false);
    expect(shouldFetchV2(T("17:51"), T("17:35"))).toBe(true);
    expect(shouldFetchV2(T("17:35") + 30_000, T("17:35"))).toBe(false);
    expect(shouldFetchV2(T("18:40"), T("17:39"))).toBe(true);
  });
  test("backoff 30 s → 10 min, honours Retry-After", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((a) => backoffMs(a) / 1000)).toEqual([30, 60, 120, 240, 480, 600, 600]);
    expect(backoffMs(0, 90)).toBe(90_000);
    expect(backoffMs(0, 5)).toBe(30_000);
    expect(backoffMs(0, 3600)).toBe(600_000);
  });
  test("share text, summary and badge carry no Instant PSI (v1.2)", () => {
    const s = buildSnapshot(allInputs(), { region: "west" }, NOW);
    expect(shareText(s)).toBe(
      "Air in the West right now: Elevated (PM2.5 117), rising. NEA 24-hr PSI: 81. Data: NEA via data.gov.sg. hazenow.sg",
    );
    const g = buildSnapshot(allInputs(), { lat: 1.35735, lon: 103.7 }, NOW);
    expect(shareText(g)).toMatch(/^Air near me right now: Elevated \(PM2\.5 117\), rising\./);
    expect(compactText(s)).toBe("● 117 ▲");
    expect(summaryLine(s)).toBe("● PM2.5 117 µg/m³ Elevated ▲+14 · NEA 24-hr PSI 81 · West · as of 4pm");
    for (const text of [shareText(s), summaryLine(s), badgeSvg(s)]) {
      expect(text).not.toMatch(/Instant|Unhealthy|lagging|165/);
    }
    expect(badgeSvg(s)).toContain("#E8A317");
  });
});


describe("experience & trust (v1.1 + v1.2, strings from docs/COPY.md)", () => {
  const up = { delta: 25, direction: "up" as const };
  const down = { delta: -22, direction: "down" as const };
  test("verdict matrix: general + sensitive rows", () => {
    expect(verdict("normal").headline).toBe("Fine to be out.");
    expect(verdict("normal", ["kids"]).headline).toBe("Fine for outdoor play.");
    expect(verdict("elevated").headline).toBe("OK to be out. Go easy on hard exercise.");
    expect(verdict("elevated", ["kids"]).headline).toBe("Calm play outside is OK. Skip running games for now.");
    expect(verdict("elevated", ["elderly"]).headline).toBe("A gentle walk is OK. Skip hard exercise for now.");
    expect(verdict("high").headline).toBe("Short trips out are OK. Exercise indoors.");
    expect(verdict("high", ["pregnant"]).headline).toBe("Stay indoors for now if you can.");
    expect(verdict("very_high").headline).toBe("Stay indoors for now. Go out only if you need to.");
    expect(verdict("very_high", ["kids"]).headline).toBe("Keep kids indoors for now.");
    expect(verdict("high", ["exercising"]).headline).toBe("Move your workout indoors.");
  });
  test("verdicts never say 'today'", () => {
    for (const b of ["normal", "elevated", "high", "very_high"] as const)
      for (const p of ["general", "kids", "elderly", "pregnant", "heart_lung", "exercising", "outdoor_worker"] as const)
        expect(verdict(b, [p]).headline).not.toMatch(/today/i);
  });
  test("mixed profile → strictest row, ties by COPY priority", () => {
    expect(verdict("elevated", ["general", "exercising"]).headline).toBe("Keep your workout light, or move it indoors.");
    expect(verdict("elevated", ["exercising", "heart_lung"]).profile).toBe("heart_lung");
    expect(verdict("high", ["kids", "elderly"]).headline).toBe("Indoor play for now. Keep trips out short."); // tie → kids > elderly
    expect(verdict("very_high", ["general", "exercising"]).profile).toBe("exercising"); // tie → exercising > general
  });
  test("works-outdoors profile", () => {
    expect(verdict("elevated", ["outdoor_worker"]).headline).toBe("OK to work outside. Take breaks indoors if you can.");
    expect(verdict("high", ["outdoor_worker"]).forWhom).toBe("For outdoor work");
    expect(actions("elevated", ["outdoor_worker"])[0]).toMatch(/breaks in the shade/);
  });
  test("short forms ≤ 28 chars, no full stop", () => {
    for (const b of ["normal", "elevated", "high", "very_high"] as const)
      for (const p of ["general", "kids", "elderly", "pregnant", "heart_lung", "exercising", "outdoor_worker"] as const) {
        const sh = verdict(b, [p]).short;
        expect(sh.length).toBeLessThanOrEqual(28);
        expect(sh.endsWith(".")).toBe(false);
      }
  });
  test("profiles: normalise + for-labels", () => {
    expect(normaliseProfile([])).toEqual(["general"]);
    expect(normaliseProfile(["general", "kids"])).toEqual(["kids"]);
    expect(normaliseProfile(["general", "exercising", "bogus"])).toEqual(["general", "exercising"]);
    expect(forWhom(["general"])).toBe("For you");
    expect(forWhom(["general", "exercising"])).toBe("For you + your workout");
    expect(forWhom(["elderly", "exercising"])).toBe("For older adults + your workout");
    expect(forWhom(["kids", "elderly", "exercising"])).toBe("For your household");
  });
  test("second line rules", () => {
    expect(secondLine("elevated", null, { stale: true, observedAt: "2026-09-28T13:00:00+08:00" })).toBe(
      "Reading is from 1pm. It may not match the air now.",
    );
    expect(secondLine("elevated", up)).toBe("Getting worse. Check again in an hour.");
    expect(secondLine("normal", up)).toBe("Rising quickly. Check again in an hour.");
    expect(secondLine("high", down)).toBe("Getting better. Check again in an hour.");
    expect(secondLine("normal", down)).toBeNull();
    const h = (vals: number[]) =>
      vals.map((pm25, i) => ({ time: new Date(Date.parse("2026-09-28T10:00:00+08:00") + i * 3600_000).toISOString(), pm25 }));
    expect(easingPeak(h([90, 140, 130, 120]))).toBe(h([0, 0])[1].time);
    expect(secondLine("elevated", { delta: -10, direction: "down" }, { history: h([90, 140, 130, 120]) })).toBe("Easing since 11am.");
    expect(verdict("elevated", ["general"], up).secondLine).toBe("Getting worse. Check again in an hour.");
  });
  test("actions filtered by profile; masks never lead; never N95 for kids", () => {
    expect(actions("normal")).toEqual([]);
    expect(actions("elevated")).toEqual(["Haze isn't always easy to see. Check here before a long run."]);
    expect(actions("elevated", ["heart_lung"])[0]).toBe("Asthma or COPD? Keep your inhaler with you.");
    expect(actions("elevated", ["kids"])).toEqual([
      "Swap running games for calm play for now.",
      "At home? Close the windows. Use a fan or aircon to keep cool.",
    ]);
    expect(actions("high")).toEqual([
      "Close windows. Use aircon or a fan to keep cool.",
      "Run a purifier in the room you're in, if you have one.",
      "Move exercise indoors, or try later.",
    ]);
    for (const b of ["elevated", "high", "very_high"] as const) {
      for (const p of [["general"], ["kids"], ["heart_lung"], ["pregnant", "kids"], ["exercising"]] as const) {
        const list = actions(b, [...p], 10);
        expect(list.length).toBeGreaterThan(0);
        expect(list[0]).not.toMatch(/mask|N95/i);
        if (p.includes("kids" as never)) expect(list.some((a) => /An N95 mask helps|Wear an N95/.test(a))).toBe(false);
      }
    }
    expect(actions("high", ["kids"], 10)).toContain("N95 masks aren't made for children. Keeping kids indoors works better.");
    expect(actions("high", ["pregnant"], 10).at(-1)).toMatch(/^Pregnant\? Wear an N95 only for short periods/);
    const vh = actions("very_high");
    expect(vh).toHaveLength(3);
    expect(vh.at(-1)).toBe("Feeling unwell? See a doctor. Chest pain or can't breathe: call 995.");
    expect(actions("very_high", ["general"], 10)).toContain("Check on older family and neighbours.");
  });
  test("calm line after an episode", () => {
    const h = (vals: number[]) =>
      vals.map((pm25, i) => ({ time: new Date(Date.parse("2026-09-28T10:00:00+08:00") + i * 3600_000).toISOString(), pm25 }));
    expect(calmLine(h([20, 22]))).toBe("Enjoy the fresh air.");
    expect(calmLine(h([80, 50, 40]))).toBe("Air's cleared. Good time to open the windows.");
    expect(calmLine(h([80, 50, 40, 30, 30, 30]))).toBe("Enjoy the fresh air.");
  });
  test("band anchor replaces N× typical", () => {
    expect(bandAnchor("elevated")).toBe("Elevated band (56–150). High starts at 151.");
    expect(bandAnchor("normal")).toBe("Normal is up to 55.");
    expect(typicalMultiple(105).text).toBe("A usual clear day in Singapore is around 20.");
    const week = Array.from({ length: 168 }, () => 10);
    expect(typicalMultiple(50, week)).toMatchObject({ typical: 10, multiple: 5 });
  });
  test("uncertainty: exact, ~, numeric range", () => {
    const base = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "south" }, NOW);
    expect(uncertainty(base)).toMatchObject({ approx: false, range: null, text: null });
    const p1 = { lat: 1.345, lon: 103.8 }; // central (105) and south (105) agree, both close
    const g1 = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, p1, NOW);
    expect(uncertainty(g1, p1)).toMatchObject({ approx: true, range: null });
    const p2 = { lat: 1.395, lon: 103.82 }; // north (49) vs central (105) differ by 56
    const g2 = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, p2, NOW);
    const u2 = uncertainty(g2, p2);
    expect(u2.range).toEqual([49, 105]);
    expect(u2.text).toBe("Nearby stations read 49–105.");
    expect(u2.a11y).toBe(`about ${g2.pm25}, nearby stations read 49 to 105`);
    expect(formatWithUncertainty(g2.pm25, u2)).toBe(String(g2.pm25)); // v1.5: never "~"
    expect(uncertaintyLine(g2, p2, { placeName: "Yishun" })).toBe("Estimate for Yishun · range 49–105");
    expect(uncertaintyLine(g1, p1)).toBe("Estimate for your spot");
    expect(uncertaintyLine(base)).toBe("Measured at South station");
    const snapped = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, REGION_COORDS.east, NOW);
    expect(uncertaintyLine(snapped, REGION_COORDS.east, { placeName: "Tampines" })).toBe("Measured at East station");
    const isle = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "island" }, NOW);
    expect(uncertaintyLine(isle)).toBe("Island average · range 49–117");
    const off = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, south: -1 }) }, { region: "south" }, NOW);
    expect(uncertaintyLine(off)).toBe("Average of other stations · range 49–117");
    expect(uncertainty(buildSnapshot({ pm25Latest: pm25Response(LATEST) }, REGION_COORDS.east, NOW), REGION_COORDS.east).approx).toBe(false);
    // exactly 30 apart is not "more than 30"
    const p3 = { lat: 1.345, lon: 103.8 };
    const g3 = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, south: 135 }) }, p3, NOW);
    expect(uncertainty(g3, p3).range).toBeNull();
  });
  test("uncertainty: island fallback shows min–max", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, south: -1 }) }, { region: "south" }, NOW);
    expect(uncertainty(s).range).toEqual([49, 117]);
  });
  test("provenance lines", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "west" }, Date.parse("2026-09-28T16:47:00+08:00"));
    const pr = provenance(s, null, Date.parse("2026-09-28T16:47:00+08:00"));
    expect(pr.full).toBe("NEA West station · measured 4pm · 47 min ago");
    expect(pr.detail).toBe("Measured 4pm · posted by NEA 4:30pm");
    expect(provenance(s, null, Date.parse("2026-09-28T16:03:00+08:00")).age).toBe("just now");
    expect(provenance(s, null, Date.parse("2026-09-28T17:10:00+08:00")).age).toBe("1 h 10 min ago");
    const p = { lat: 1.33, lon: 103.72 };
    const g = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, p, NOW);
    expect(provenance(g, p, NOW).text).toBe("Near you · West station 3.8 km · measured 4pm");
    expect(provenance(g, p, NOW, { placeName: "Jurong East" }).text).toBe("Jurong East · West station 3.8 km · measured 4pm");
    const isle = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "island" }, NOW);
    expect([isle.pm25, isle.locationMode, isle.nearestRegion]).toEqual([92, "island", ""]);
    expect(provenance(isle, null, NOW).text).toBe("Singapore (island average) · measured 4pm");
    const off = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, west: -1 }) }, p, NOW);
    expect(provenance(off, p, NOW).note).toBe("West station is offline. Using nearby stations.");
    const isl = buildSnapshot({ pm25Latest: pm25Response({ ...LATEST, south: -1 }) }, { region: "south" }, NOW);
    expect(provenance(isl, null, NOW).text).toBe("South station is offline. Showing the average of NEA's other stations.");
  });
  test("trend words (COPY §4)", () => {
    const h = (vals: number[]) =>
      vals.map((pm25, i) => ({ time: new Date(Date.parse("2026-09-28T10:00:00+08:00") + i * 3600_000).toISOString(), pm25 }));
    expect(trendWords(h([79, 103, 117]))).toBe("Rising fast: up 38 in 2 hours");
    expect(trendWords(h([100, 108]))).toBe("Rising: up 8 in the last hour");
    expect(trendWords(h([100, 130]))).toBe("Rising fast: up 30 in the last hour");
    expect(trendWords(h([100, 90]))).toBe("Easing: down 10 in the last hour");
    expect(trendWords(h([130, 100]))).toBe("Clearing fast: down 30 in the last hour");
    expect(trendWords(h([100, 102]))).toBe("Steady over the last hour");
    expect(trendWords(h([100]))).toBe("Trend not available yet");
    expect(trendWord(h([100, 125]))).toBe("rising fast");
    expect(trendWord(h([100]))).toBeNull();
  });
  test("accessibility + official figure labels", () => {
    const s = buildSnapshot(allInputs(), { region: "south" }, NOW);
    expect(headlineLabel(s)).toBe("OK to be out. Go easy on hard exercise. For you. PM2.5 105, Elevated, steady.");
    expect(accessibleLabel(s)).toBe("PM2.5 105, Elevated, steady, measured 4pm");
    expect(officialPsiLabel(84, psiLabel)).toBe("NEA 24-hr PSI: 84 (Moderate)");
    expect(officialPsiLabel(null, psiLabel)).toBe("NEA 24-hr PSI: not available right now");
    expect(chartSummary(s.history)).toMatch(/^Chart\. Over the last 24 hours PM2\.5 went from \d+ to 105, peaking at \d+ at \w+\. NEA 24-hr PSI went from \d+ to 84\.$/);
  });
});

describe("v1 + v2 sources (SPEC v1.3)", () => {
  const V1 = "https://api.data.gov.sg/v1/environment/";
  const fx = (f: string) => require(`../fixtures/${f}`);
  const V1R: Record<string, unknown> = {
    [V1 + "pm25"]: fx("v1-pm25-latest.json"),
    [V1 + "psi"]: fx("v1-psi-latest.json"),
    [V1 + "pm25?date=2026-09-28"]: fx("v1-pm25-2026-09-28.json"),
    [V1 + "pm25?date=2026-09-27"]: fx("v1-pm25-2026-09-27.json"),
    [V1 + "psi?date=2026-09-28"]: fx("v1-psi-2026-09-28.json"),
    [V1 + "psi?date=2026-09-27"]: fx("v1-psi-2026-09-27.json"),
  };
  const NOW17 = Date.parse("2026-09-28T17:05:00+08:00");
  beforeEach(() => clearCache());

  type Rule = number | "throw";
  const mockFetch = (rules: Record<string, Rule> = {}) => {
    const calls: string[] = [];
    const f: FetchLike = async (url) => {
      calls.push(url);
      const key = url.replace(V1, "v1:").replace(BASE, "v2:");
      const rule = rules[key] ?? (key.startsWith("v1:") ? rules["v1:*"] : rules["v2:*"]);
      if (rule === "throw") throw new TypeError("fetch failed");
      if (rule) return { ok: false, status: rule, headers: { get: () => null }, json: async () => ({ code: 24, data: null }) };
      const body = V1R[url] ?? R[url];
      if (!body) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => clone(body) };
    };
    return { f, calls };
  };

  test("fromV1 normalises snake_case; parseHours keeps update_timestamp as published", () => {
    const n = fromV1(fx("v1-pm25-latest.json"))!;
    expect(n.data!.regionMetadata!.find((m) => m.name === "west")!.labelLocation).toEqual({ latitude: 1.35735, longitude: 103.7 });
    const h = parseHours(n, "pm25_one_hourly");
    expect(h[0]).toEqual({
      time: "2026-09-28T17:00:00+08:00",
      published: "2026-09-28T17:00:59+08:00",
      values: { south: 140, west: 107, north: 55, east: 108, central: 137 },
    });
    expect(fromV1({ message: "invalid date format" })).toBeNull();
    expect(fromV1(R[BASE + "pm25"])).toBe(R[BASE + "pm25"]); // v2 passes through
  });
  test("merge rule: v2 if valid, else v1 if valid, else invalid; publishedAt from v1", () => {
    const t = "2026-09-28T15:00:00+08:00";
    const v1 = [{ time: t, published: "2026-09-28T15:01:58+08:00", values: { south: null, west: 103, east: 63 } }];
    const v2 = [{ time: t, published: "2026-09-28T15:46:02+08:00", values: { south: 106, west: null, north: 53 } }];
    expect(mergeV1V2(v1, v2)).toEqual([
      { time: t, published: "2026-09-28T15:01:58+08:00", values: { south: 106, west: 103, east: 63, north: 53 } },
    ]);
    expect(mergeV1V2([], v2)[0].published).toBe("2026-09-28T15:46:02+08:00");
    expect(mergeV1V2([{ ...v1[0], values: { south: null } }], [{ ...v2[0], values: { south: null } }])[0].values.south).toBeNull();
  });
  test("live-shaped merge: v1 brings the new hour first, v2 back-fills v1's gap", async () => {
    const { f } = mockFetch();
    const s = await getSnapshot({ region: "south", fetch: f, now: NOW17, retryDelayMs: 0 });
    expect(s.observedAt).toBe("2026-09-28T17:00:00+08:00");
    expect(s.publishedAt).toBe("2026-09-28T17:00:59+08:00");
    expect(s.pm25).toBe(140);
    // v1 is missing south at 15:00; v2 has 106
    expect(s.history.find((h) => h.time === "2026-09-28T15:00:00+08:00")!.pm25).toBe(106);
    expect(s.officialPsi24h).toBe(90);
    expect(s.history.at(-1)!.pm25Avg24h).toBeGreaterThan(0);
  });
  test("call pattern: v1 every poll, yesterday cached, v2 only when due", async () => {
    const { f, calls } = mockFetch();
    await getSnapshot({ fetch: f, now: NOW17, retryDelayMs: 0 });
    expect(calls.filter((c) => c.startsWith(V1)).length).toBe(4);
    expect(calls.filter((c) => c.startsWith(BASE)).length).toBe(2);
    calls.length = 0;
    await getSnapshot({ fetch: f, now: NOW17 + 60_000, retryDelayMs: 0 });
    expect(calls.sort()).toEqual([V1 + "pm25?date=2026-09-28", V1 + "psi?date=2026-09-28"]);
    calls.length = 0;
    await getSnapshot({ fetch: f, now: Date.parse("2026-09-28T17:35:00+08:00"), retryDelayMs: 0 });
    expect(calls.filter((c) => c.startsWith(BASE)).length).toBe(2);
  });
  test("v1 down → v2 fallback", async () => {
    const { f } = mockFetch({ "v1:*": "throw" });
    const s = await getSnapshot({ region: "west", fetch: f, now: NOW17, retryDelayMs: 0 });
    expect(s.observedAt).toBe("2026-09-28T16:00:00+08:00");
    expect(s.pm25).toBe(117);
  });
  test("v2 429 → backoff (no retry storm); v1 still serves", async () => {
    const { f, calls } = mockFetch({ "v2:*": 429 });
    const s = await getSnapshot({ region: "west", fetch: f, now: NOW17, retryDelayMs: 0 });
    expect(s.pm25).toBe(107);
    expect(calls.filter((c) => c.startsWith(BASE)).length).toBe(2); // one call per endpoint, no inline retries
    expect(v2BackoffUntil()).toBe(NOW17 + 30_000);
    // During backoff, even a due v2 call is skipped.
    calls.length = 0;
    await getSnapshot({ region: "west", fetch: f, now: NOW17 + 10_000, v2: "always", retryDelayMs: 0 });
    expect(calls.filter((c) => c.startsWith(BASE)).length).toBe(0);
    // Next failure doubles the backoff.
    await getSnapshot({ region: "west", fetch: f, now: NOW17 + 31_000, v2: "always", retryDelayMs: 0 });
    expect(v2BackoffUntil()).toBe(NOW17 + 31_000 + 60_000);
  });
  test("everything down + v2 rate-limited → throws; caller keeps last snapshot, which goes stale by age", async () => {
    const good = await getSnapshot({ region: "west", fetch: mockFetch().f, now: NOW17, retryDelayMs: 0 });
    clearCache();
    const { f } = mockFetch({ "v1:*": "throw", "v2:*": 429 });
    await expect(getSnapshot({ region: "west", fetch: f, now: NOW17, retryDelayMs: 0 })).rejects.toThrow(/rate-limited/);
    expect(refreshStale(good, NOW17 + 30 * 60_000).stale).toBe(false);
    expect(refreshStale(good, Date.parse("2026-09-28T19:20:00+08:00")).stale).toBe(true);
  });
  test("v1 5xx retried once", async () => {
    let n = 0;
    const base = mockFetch().f;
    const f: FetchLike = async (url, init) => {
      if (url === V1 + "pm25?date=2026-09-28" && n++ === 0) return { ok: false, status: 503, json: async () => ({}) };
      return base(url, init);
    };
    const s = await getSnapshot({ region: "north", fetch: f, now: NOW17, retryDelayMs: 0, v2: "never" });
    expect(s.pm25).toBe(55);
    expect(n).toBe(2);
  });
  test("history=false uses latest endpoints only", async () => {
    const { f, calls } = mockFetch();
    const s = await getSnapshot({ region: "west", fetch: f, now: NOW17, history: false, v2: "never" });
    expect(s.pm25).toBe(107);
    expect(calls.sort()).toEqual([V1 + "pm25", V1 + "psi"]);
  });
  test("network down everywhere → throws", async () => {
    const f: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(getSnapshot({ fetch: f, now: NOW17, retryDelayMs: 0 })).rejects.toThrow(/data\.gov\.sg/);
  });
});

describe("QA scenarios (fixtures/scenarios)", () => {
  const load = (n: string) => require(`../fixtures/scenarios/${n}.json`) as Scenario;
  const snap = (n: string, q: Record<string, unknown> = { region: "west" }) => {
    const sc = load(n);
    clearCache();
    return getSnapshot({ ...q, fetch: scenarioFetch(sc), now: Date.parse(sc._meta.now), retryDelayMs: 0 });
  };
  test("every scenario file exists", () => {
    for (const n of SCENARIOS) expect(load(n)._meta.scenario).toBe(n);
  });
  test("normal / elevated / high / very_high bands", async () => {
    expect((await snap("normal")).band).toBe("normal");
    expect((await snap("elevated")).pm25).toBe(117);
    expect((await snap("high")).band).toBe("high");
    expect((await snap("very_high")).band).toBe("very_high");
  });
  test("south_offline → island mean 89", async () => {
    const s = await snap("south_offline", { region: "south" });
    expect([s.pm25, s.locationMode]).toEqual([89, "island"]);
  });
  test("all_offline_stale → walks back to 3pm, stale", async () => {
    const s = await snap("all_offline_stale");
    expect(s.observedAt).toBe("2026-09-28T15:00:00+08:00");
    expect(s.stale).toBe(true);
  });
  test("rising_fast → +25", async () => {
    const s = await snap("rising_fast", { region: "central" });
    expect(s.trend).toEqual({ delta: 25, direction: "up" });
    expect(verdict(s.band, ["general"], s.trend).secondLine).toBe("Getting worse. Check again in an hour.");
  });
  test("all_clear → Normal now, All clear card offered", async () => {
    const s = await snap("all_clear");
    expect(s.band).toBe("normal");
    expect(pickShareCard(s).card).toBe("clear");
  });
  test("network_error → throws", async () => {
    await expect(snap("network_error")).rejects.toThrow();
  });
});

describe("areas (SPEC v1.4)", () => {
  const data = require("../data/sg-areas.json") as { name: string; aliases: string[]; lat: number; lon: number }[];
  test("sg-areas.json: 55 URA planning areas inside Singapore's bounding box, same as bundled data", () => {
    expect(data).toHaveLength(55);
    expect(SG_AREAS).toEqual(data);
    for (const a of data) {
      expect(a.lat).toBeGreaterThan(1.15);
      expect(a.lat).toBeLessThan(1.48);
      expect(a.lon).toBeGreaterThan(103.59);
      expect(a.lon).toBeLessThan(104.1);
      expect(Array.isArray(a.aliases)).toBe(true);
    }
    for (const n of ["Tampines", "Jurong East", "Punggol", "Bukit Timah", "Ang Mo Kio", "Woodlands", "Downtown Core"])
      expect(findArea(n)).not.toBeNull();
    const names = data.flatMap((a) => [a.name, ...a.aliases].map((n) => n.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });
  test("searchAreas ranks names, prefixes and aliases", () => {
    expect(searchAreas("tampines")[0].name).toBe("Tampines");
    expect(searchAreas("jur").map((a) => a.name).slice(0, 2).sort()).toEqual(["Jurong East", "Jurong West"]);
    expect(searchAreas("east").map((a) => a.name)).toEqual(expect.arrayContaining(["Marine Parade", "Jurong East"]));
    const simei = searchAreas("simei")[0];
    expect([simei.name, simei.matched]).toEqual(["Tampines", "Simei"]);
    expect(searchAreas("AMK")[0].name).toBe("Ang Mo Kio");
    expect(searchAreas("angmo")[0].name).toBe("Ang Mo Kio");
    expect(searchAreas("sentosa")[0].name).toBe("Southern Islands");
    expect(searchAreas("zzz")).toEqual([]);
    expect(searchAreas("")).toHaveLength(55);
    expect(searchAreas("a", 3)).toHaveLength(3);
  });
  test("area centroid → same distance-weighted estimate as GPS", () => {
    const t = findArea("Tampines")!;
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { lat: t.lat, lon: t.lon }, NOW);
    expect(s.locationMode).toBe("gps");
    expect(s.nearestRegion).toBe("east");
  });
  test("roundCoord keeps 2 decimals (~1 km)", () => {
    expect(roundCoord(1.354321)).toBe(1.35);
    expect(roundCoord(103.94567)).toBe(103.95);
  });
});

describe("no '~' on any number surface (SPEC v1.5)", () => {
  test("share text, summary, compact, badge", () => {
    for (const sc of ["elevated", "south_offline", "all_offline_stale"]) {
      const inputs = require(`../fixtures/scenarios/${sc}.json`);
      const s = buildSnapshot({ pm25Days: [inputs.pm25, inputs.pm25Yesterday], psiDays: [inputs.psi, inputs.psiYesterday] }, { lat: 1.395, lon: 103.82 }, NOW);
      for (const t of [shareText(s), summaryLine(s), compactText(s), badgeSvg(s)]) expect(t).not.toContain("~");
    }
  });
});

describe("share system (SPEC v1.6)", () => {
  // Synthetic day: hourly West PM2.5 values ending at 2026-09-28 16:00 SGT, optional 24-hr averages.
  const END = Date.parse("2026-09-28T16:00:00+08:00");
  const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().replace("Z", "+08:00").replace(".000", "");
  function snap(values: number[], avg?: number[], region = "west") {
    const n = values.length;
    const items = values.map((v, i) => {
      const t = END - (n - 1 - i) * 3600_000;
      return { timestamp: iso(t), updatedTimestamp: iso(t + 60_000), readings: { pm25_one_hourly: { north: v, south: v, east: v, west: v, central: v } } };
    });
    const psiItems = values.map((_, i) => {
      const t = END - (n - 1 - i) * 3600_000;
      const a = avg ? avg[i] : 30;
      return { timestamp: iso(t), updatedTimestamp: iso(t), readings: { psi_twenty_four_hourly: { north: 70, south: 70, east: 70, west: 70, central: 70 }, pm25_twenty_four_hourly: { north: a, south: a, east: a, west: a, central: a } } };
    });
    return buildSnapshot({ pm25Days: [{ code: 0, data: { items } }], psiDays: [{ code: 0, data: { items: psiItems } }] }, { region }, END + 35 * 60_000);
  }
  const flat = (v: number, n = 24) => Array.from({ length: n }, () => v);

  test("rule 1: Normal now and ≥ Elevated within 12 h → All clear", () => {
    const s = snap([...flat(30, 14), 80, 120, 162, 140, 90, 60, 50, 40, 30, 22]);
    const p = pickShareCard(s, ["general"]);
    expect(p.card).toBe("clear");
    expect(p.alternates).toEqual(["now", "clocks"]);
    // Elevated 13+ hours ago doesn't count
    const old = snap([90, ...flat(30, 23)]);
    expect(pickShareCard(old).card).toBe("now");
  });
  test("rule 2: persona + ≥ Elevated → group, persona by priority", () => {
    const s = snap(flat(100));
    expect(pickShareCard(s, ["kids", "elderly"])).toEqual({ card: "group", persona: "kids", alternates: ["now", "clocks"] });
    expect(pickShareCard(s, ["elderly", "exercising"]).persona).toBe("elderly");
    expect(pickShareCard(s, ["pregnant", "heart_lung"]).persona).toBe("heart_lung");
    expect(pickShareCard(s, ["exercising", "outdoor_worker"]).persona).toBe("exercising");
    expect(pickShareCard(s, ["outdoor_worker"]).persona).toBe("outdoor_worker");
  });
  test("rule 1 beats rule 2 (all clear even with a persona)", () => {
    const s = snap([...flat(30, 20), 90, 60, 40, 30]);
    expect(pickShareCard(s, ["kids"])).toEqual({ card: "clear", persona: "kids", alternates: ["now", "clocks", "group"] });
  });
  test("rule 3: ≥ Elevated without persona → now", () => {
    expect(pickShareCard(snap(flat(170)), ["general"]).card).toBe("now");
    expect(pickShareCard(snap(flat(170)), ["general"]).alternates).toEqual(["clocks"]);
  });
  test("rule 4: Normal and |1-hr − 24-hr avg| ≥ 40 either way, or from 'Why two numbers?' → clocks", () => {
    expect(pickShareCard(snap(flat(50), flat(90)), ["general"]).card).toBe("clocks"); // 40 below the average
    expect(pickShareCard(snap(flat(50), flat(89)), ["general"]).card).toBe("now"); // 39: not enough
    expect(pickShareCard(snap(flat(20), flat(30)), ["general"], undefined, { fromWhyTwoNumbers: true }).card).toBe("clocks");
  });
  test("rule 5: otherwise → now", () => {
    expect(pickShareCard(snap(flat(20), flat(22)), ["general"])).toEqual({ card: "now", persona: undefined, alternates: ["clocks"] });
  });
  test("episode stats: worst hour and hours above Normal", () => {
    const s = snap([...flat(30, 14), 80, 120, 162, 140, 90, 60, 50, 40, 30, 22]);
    const ep = episodeStats(s.history)!;
    expect(ep.worst.pm25).toBe(162);
    expect(formatSgtTime(ep.worst.time)).toBe("9am");
    expect(ep.hoursAbove).toBe(6);
    expect(ep.truncated).toBe(false);
    expect(episodeStats(snap(flat(20)).history)).toBeNull();
    expect(episodeStats(snap(flat(90)).history)!.truncated).toBe(true);
  });
  test("card words: Now card", () => {
    const s = snap([...flat(90, 22), 100, 136]);
    const c = shareCardContent("now", s, ["general"], { placeName: "Tampines" }) as NowCard;
    expect(c.hook).toBe("Air near Tampines · Mon 28 Sep, 4pm");
    expect(c.headline).toBe("Elevated, and rising fast.");
    expect(c.pmDetail).toBe("µg/m³ 1-hr PM2.5 · up 46 in 2 hours");
    expect([c.adviceMost, c.adviceVulnerable]).toEqual(["Reduce strenuous outdoor activity.", "Avoid strenuous outdoor activity."]);
    expect(c.psiLine).toContain("The 24-hr PSI (70) averages the whole day.");
    expect(nowHeadline(snap(flat(20)))).toBe("Normal, and steady.");
  });
  test("card words: group, clocks, clear, preview", () => {
    const g = shareCardContent("group", snap(flat(71)), ["kids"]) as GroupCard;
    expect(g.chip).toBe("For the kids · Recess check");
    expect(g.headline).toBe("Calm play only, for now.");
    expect(g.statsRest).toBe("µg/m³ · Elevated · steady");
    expect(g.actions.at(-1)).toBe("Next check at 5pm.");
    expect(g.actions.join(" ")).not.toMatch(/N95/);
    expect((shareCardContent("group", snap(flat(200)), ["elderly"]) as GroupCard).headline).toBe("Stay indoors for now.");
    const k = shareCardContent("clocks", snap(flat(134), flat(43))) as ClocksCard;
    expect([k.pm25, k.avg, k.psi, k.bars.length]).toEqual([134, 43, 70, 24]);
    const cl = shareCardContent("clear", snap([...flat(30, 14), 80, 120, 162, 140, 90, 60, 50, 40, 30, 22])) as ClearCard;
    expect(cl.stats).toBe("Worst hour this episode: 162 at 9am. 6 hours above Normal.");
    const pv = shareCardContent("preview", snap(flat(100))) as PreviewCard;
    expect([pv.pm25, pv.direction, pv.psi]).toEqual([100, "steady", 70]);
  });
  test("share text per card: headline-matched, ends with the site, no ~ / Instant PSI / anti-NEA words", () => {
    const s = snap([...flat(90, 22), 100, 136]);
    const all = (["now", "clocks", "group", "clear"] as const).map((c) => shareCardText(c, s, ["kids"], { placeName: "Tampines" }));
    expect(all[0]).toBe("Air near Tampines at 4pm: Elevated (PM2.5 136), rising fast. NEA 24-hr PSI: 70 (Moderate). Data: NEA via data.gov.sg. hazenow.sg");
    expect(all[1]).toMatch(/^Same NEA data, two clocks\. Tampines at 4pm: last hour PM2.5 136, 24-hr average 30\./);
    expect(all[2]).toMatch(/^For the kids · Recess check, Tampines at 4pm: /);
    for (const t of all) {
      expect(t.endsWith("hazenow.sg")).toBe(true);
      expect(t).not.toMatch(/~|Instant|real number|lagging|Unhealthy/);
    }
  });
  test("share file names carry the time; card dates are absolute", () => {
    expect(shareFileName("Choa Chu Kang", "2026-09-28T17:00:00+08:00")).toBe("hazenow-choa-chu-kang-2026-09-28-1700.png");
    expect(shareFileName("West", "2026-09-28T09:00:00+08:00", "clocks")).toBe("hazenow-west-2026-09-28-0900-clocks.png");
    expect(formatCardWhen("2026-09-29T07:00:00+08:00")).toBe("Tue 29 Sep, 7am");
  });
  test("place naming: GPS uses the station distance; nearest area helper", () => {
    const p = { lat: 1.35, lon: 103.95 };
    expect(nearestArea(p).name).toBe("Tampines");
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, p, NOW);
    const pl = sharePlace(s, { placeName: "Tampines", point: p });
    expect(pl.station).toMatch(/^NEA East station · \d\.\d km away$/);
    expect(sharePlace(buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "island" }, NOW)).hook).toBe("Air across Singapore");
  });
});

describe("SPEC v1.7 parity", () => {
  test("uncertainty range always contains the estimate (Clementi: 120 must not show 137–140)", () => {
    const clementi = findArea("Clementi")!;
    const pt = { lat: clementi.lat, lon: clementi.lon };
    // South offline; the two nearest (Central, West) read 137–140 but the farther North/East pull the
    // blended estimate to ~120. The old "two nearest" rule showed "range 137–140", excluding the estimate.
    const vals = { north: 60, south: -1, east: 60, west: 137, central: 140 };
    const s = buildSnapshot({ pm25Latest: pm25Response(vals) }, pt, NOW);
    const u = uncertainty(s, pt);
    expect(s.pm25).toBeLessThan(137);
    expect(u.range).not.toBeNull();
    if (u.range) {
      expect(u.range[0]).toBeLessThanOrEqual(s.pm25);
      expect(u.range[1]).toBeGreaterThanOrEqual(s.pm25);
      expect(u.range).not.toEqual([137, 140]);
    }
    expect(uncertaintyLine(s, pt, { placeName: "Clementi" })).not.toContain("range 137–140");
  });
  test("stationRange: ≥ two nearest, stations within 1.5× nearest distance, widened to the estimate", () => {
    expect(stationRange([{ v: 137, d: 4 }, { v: 140, d: 5 }, { v: 40, d: 5.5 }], 120)).toEqual([40, 140]);
    expect(stationRange([{ v: 137, d: 4 }, { v: 140, d: 5 }, { v: 40, d: 9 }], 120)).toEqual([120, 140]);
    expect(stationRange([{ v: 80, d: 2 }, { v: 90, d: 9 }], 85)).toEqual([80, 90]);
  });
  test("island range includes the mean", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "island" }, NOW);
    const u = uncertainty(s);
    expect(u.range![0]).toBeLessThanOrEqual(s.pm25);
    expect(u.range![1]).toBeGreaterThanOrEqual(s.pm25);
  });
  test("stale share (COPY §19): delayed headline, 'reading from … (latest available)', never 'right now'", () => {
    const s = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "west" }, Date.parse("2026-09-28T19:00:00+08:00"));
    expect(s.stale).toBe(true);
    const now = shareCardContent("now", s) as NowCard;
    expect(now.headline).toBe("Latest NEA reading is delayed.");
    expect(now.hook).toBe("West · reading from Mon 28 Sep, 4pm (latest available)");
    const g = shareCardContent("group", s, ["kids"]) as GroupCard;
    expect([g.headline, g.place, g.when]).toEqual(["Latest NEA reading is delayed.", "West · reading from Mon 28 Sep, 4pm (latest available)", ""]);
    const k = shareCardContent("clocks", s) as ClocksCard;
    expect(k.place).toContain("(latest available)");
    expect(k.axisEnd).toBe("4pm");
    for (const c of ["now", "clocks", "group", "clear"] as const) {
      const t = shareCardText(c, s, ["kids"]);
      expect(t.startsWith("Latest NEA reading is delayed. West · reading from Mon 28 Sep, 4pm (latest available)")).toBe(true);
      expect(t).not.toMatch(/right now/);
    }
  });
});

describe("stale cards hide the trend (COPY §19)", () => {
  const rising = [...Array.from({ length: 22 }, () => 60), 80, 125];
  const iso = (t: number) => new Date(t + 8 * 3600_000).toISOString().replace("Z", "+08:00").replace(".000", "");
  const END = Date.parse("2026-09-28T16:00:00+08:00");
  const items = rising.map((v, i) => ({ timestamp: iso(END - (23 - i) * 3600_000), updatedTimestamp: iso(END - (23 - i) * 3600_000), readings: { pm25_one_hourly: { north: v, south: v, east: v, west: v, central: v } } }));
  const mk = (now: number) => buildSnapshot({ pm25Days: [{ code: 0, data: { items } }] }, { region: "west" }, now);
  test("fresh: trend shown, axis ends at Now", () => {
    const s = mk(END + 30 * 60_000);
    expect((shareCardContent("now", s) as NowCard).pmDetail).toBe("µg/m³ 1-hr PM2.5 · up 65 in 2 hours");
    expect((shareCardContent("group", s, ["kids"]) as GroupCard).statsRest).toBe("µg/m³ · Elevated · rising fast");
    expect((shareCardContent("preview", s) as PreviewCard).direction).toBe("up");
    expect((shareCardContent("clocks", s) as ClocksCard).axisEnd).toBe("Now");
  });
  test("stale: no trend anywhere, axis ends at the reading's hour", () => {
    const s = mk(END + 3 * 3600_000);
    expect(s.stale).toBe(true);
    expect((shareCardContent("now", s) as NowCard).pmDetail).toBe("µg/m³ 1-hr PM2.5");
    expect((shareCardContent("group", s, ["kids"]) as GroupCard).statsRest).toBe("µg/m³ · Elevated");
    expect((shareCardContent("preview", s) as PreviewCard).direction).toBeNull();
    expect((shareCardContent("clocks", s) as ClocksCard).axisEnd).toBe("4pm");
    for (const c of ["now", "clocks", "group", "clear"] as const) expect(shareCardText(c, s, ["kids"])).not.toMatch(/rising|up \d+|easing|steady/);
  });
});

describe("stale wording (COPY §19): 'that hour', never 'next hour' / 'last hour' / 'right now'", () => {
  const s = buildSnapshot({ pm25Latest: pm25Response(LATEST), psi: R[BASE + "psi"] }, { region: "west" }, Date.parse("2026-09-28T19:00:00+08:00"));
  test("Now card advice label and PSI line", () => {
    const c = shareCardContent("now", s) as NowCard;
    expect(c.adviceLabel).toBe("NEA’s advice for that hour");
    expect(c.psiLine).toBe("The 24-hr PSI (81) averages the whole day. This reading is for the 4pm hour.");
  });
  test("group card: 'Next check at …' becomes 'Check hazenow.sg for NEA's next update.'", () => {
    const g = shareCardContent("group", s, ["kids"]) as GroupCard;
    expect(g.actions.at(-1)).toBe("Check hazenow.sg for NEA's next update.");
    expect(g.actions.join(" ")).not.toMatch(/Next check at/);
    const fresh = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "west" }, NOW);
    expect((shareCardContent("group", fresh, ["kids"]) as GroupCard).actions.at(-1)).toBe("Next check at 5pm.");
  });
  test("Two clocks first box reads 'The 4pm hour'", () => {
    expect((shareCardContent("clocks", s) as ClocksCard).nowLabel).toBe("The 4pm hour");
  });
  test("no card string or share text says right now / this hour / the last hour / next hour", () => {
    const bad = /right now|this hour|the last hour|next hour/i;
    for (const c of ["now", "clocks", "group", "clear", "preview"] as const) {
      const content = JSON.stringify(shareCardContent(c, s, ["kids"]));
      expect(content).not.toMatch(bad);
      if (c !== "preview") expect(shareCardText(c, s, ["kids"])).not.toMatch(bad);
    }
    // fresh cards keep the live wording
    const fresh = buildSnapshot({ pm25Latest: pm25Response(LATEST) }, { region: "west" }, NOW);
    expect((shareCardContent("now", fresh) as NowCard).adviceLabel).toBe("NEA’s advice for the next hour");
    expect((shareCardContent("clocks", fresh) as ClocksCard).nowLabel).toBe("The last hour");
  });
});
